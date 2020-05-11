from collections import OrderedDict
from contextlib import contextmanager
from datetime import datetime, timedelta
from memo import memo
from tenacity import retry, stop_after_attempt, wait_exponential, RetryError
import bs4
import json
import logging
import os
import pandas as pd
import re
import requests
import traceback
import urllib.parse


CITIES_URL = 'https://search.k8s.mfb.io/api/v1/cities?locale=en_US'
BASE_URL = 'https://shop.flixbus.com/search'
CITIES_CACHE_FILE = 'cities.json'

DURATION_RE = re.compile('(?P<hour>[0-9]{1,2})(:(?P<minute>[0-9]{2}))? Hrs\.')
TIME_RE = re.compile('(?P<hour>[1]?[0-9]):(?P<minute>[0-9]{2}) (?P<ampm>am|pm)')
COST_RE = re.compile('\$(?P<cost>[0-9,]+\.[0-9]{2})')

DEFAULT_OUTPUT_DIR = 'out'

RETRY_MAX_ATTEMPTS = 10
RETRY_MIN_DELAY = 1
RETRY_MAX_DELAY = 60

REQUESTS_PER_SEC = 1

DEFAULT_SCRAPE_CITIES = [
    'Amsterdam',
    'Berlin',
    'Budapest',
    'Copenhagen',
    'Dresden',
    'Frankfurt',
    'Oslo',
    'Stockholm',
]
DEFAULT_SAMPLE_DAYS = [x for x in range(30) if x < 14 or (x % 4) == 0]


formatter = logging.Formatter('%(asctime)s:%(levelname)s:%(name)s:%(message)s')
logger = logging.getLogger(__name__)


#def retry(*retry_args, **retry_kwargs):
#    """Greenlet-friendly version of tenacity.retry."""
#    def wrapper(func):
#        @functools.wraps(func)
#        def wrappee(*args, **kwargs):
#            decorate = retry_(*retry_args, **retry_kwargs)
#            return decorate(func)(*args, **kwargs)
#        pass
#    return wrapper


@contextmanager
def log_to_file(logger, filename):
    handler = logging.FileHandler(filename)
    handler.setFormatter(formatter)
    handler.setLevel(logging.INFO)
    try:
        logger.addHandler(handler)
        yield
    finally:
        logger.removeHandler(handler)
        handler.close()


@memo
def get_city_mapping():
    if not os.path.exists('cities.json'):
        logger.info('Downloading city info to cache file: {}'.format(CITIES_CACHE_FILE))
        cities = requests.get(CITIES_URL).json()
        with open(CITIES_CACHE_FILE, 'w') as f:
            json.dump(cities, f)
    else:
        with open(CITIES_CACHE_FILE) as f:
            cities = json.load(f)

    return {v['name']: k for k, v in cities['cities'].items()}


def get_city_code(city):
    return get_city_mapping()[city]


def check_re_match(re_pattern, re_name, text):
    match = re_pattern.match(text)
    assert match is not None, '{!r} did not match {} pattern'.format(text, re_name)
    return match


def parse_duration(duration_text):
    match = check_re_match(DURATION_RE, 'DURATION_RE', duration_text)
    duration = int(match.group('hour')) * 60
    if match.group('minute') is not None:
        duration += int(match.group('minute'))
    return duration


def parse_time(time_text):
    match = check_re_match(TIME_RE, 'TIME_RE', time_text)
    hour = int(match.group('hour'))
    minute = int(match.group('minute'))
    is_pm = match.group('ampm') == 'pm'
    if is_pm:
        hour += 12
    return '{}:{:02d}'.format(hour, minute)


def parse_cost(cost_text):
    match = check_re_match(COST_RE, 'COST_RE', cost_text)
    return float(match.group('cost').replace(',', ''))


def process_ride(ride):
    departure_date = ride.attrs['data-departure-date']
    detail = ride.find(class_='ride-available')  # doesn't matter if it's available or not

    duration_text = detail.find('div', class_='duration').text.strip()
    duration = parse_duration(duration_text)

    departure_time_text = detail.find(class_='departure').text.strip()
    departure_time = parse_time(departure_time_text)
    departure_station = detail.find(class_='departure-station-name').text
    assert departure_station == departure_station.strip()

    arrival_time_text = detail.find(class_='arrival').text.strip()
    arrival_time = parse_time(arrival_time_text)
    arrival_station = detail.find(class_='arrival-station-name').text
    assert arrival_station == arrival_station.strip()

    available = detail.find(class_='unavailable') is not None
    cost_elem = detail.find(class_='total')
    available = cost_elem is not None
    cost = parse_cost(cost_elem.text) if available else None

    return OrderedDict([
        ['date', departure_date],
        ['departure_time', departure_time],
        ['arrival_time', arrival_time],
        ['duration_minutes', duration],
        ['departure_station', departure_station],
        ['arrival_station', arrival_station],
        ['cost', cost],
        ['available', available],
    ])


def process_page(html_text):
    root = bs4.BeautifulSoup(html_text, 'html.parser')
    rides = root.find_all(class_='ride-item-pair')
    if len(rides) == 0:
        okay = root.find(class_='filters-dont-match-any-trips') is not None
        if okay:
            return pd.DataFrame()

        warning_elem = root.find(class_='message-warning')
        message = 'No rides found'
        if warning_elem:
            message += ': {!r}'.format(warning_elem.text)
        raise ValueError(message)

    assert len(rides) > 0
    return pd.DataFrame([process_ride(x) for x in rides])


def make_url(arrival_city, departure_city, ride_date, adults=1):
    params = {
        'adult': adults,
        'arrivalCity': get_city_code(arrival_city),
        'departureCity': get_city_code(departure_city),
        'rideDate': '{}.{}.{}'.format(ride_date.day, ride_date.month, ride_date.year),
    }
    args = urllib.parse.urlencode(params)
    return '{}?{}'.format(BASE_URL, args)


def download(arrival_city, departure_city, ride_date, adults=1):
    url = make_url(arrival_city, departure_city, ride_date, adults)
    response = requests.get(url)
    if response.status_code != 200:
        raise ValueError('HTTP {}: {}'.format(response.status_code, response.content))
    return response.content


def get_path(scrape_time, arrival_city, departure_city, ride_date, attempt_num=None):
    arrival_city_code = get_city_code(arrival_city)
    departure_city_code = get_city_code(departure_city)
    parts = [departure_city_code, arrival_city_code, str(ride_date)]
    if attempt_num is not None:
        parts += [str(attempt_num)]
    return '.'.join(parts)


def run(
        base_dir, arrival_city, departure_city, ride_date, scrape_time=None, adults=1,
        attempt_num=None):
    info_text = 'arrival_city={!r}, departure_city={!r}, ride_date={!r}, adults={}, attempt={}' \
        .format(arrival_city, departure_city, str(ride_date), adults, attempt_num)

    scrape_time = scrape_time or datetime.now()
    log_dir = os.path.join(base_dir, 'log')
    html_dir = os.path.join(base_dir, 'html')
    data_dir = os.path.join(base_dir, 'data')
    os.makedirs(log_dir, exist_ok=True)
    os.makedirs(html_dir, exist_ok=True)
    os.makedirs(data_dir, exist_ok=True)

    base_name = get_path(scrape_time, arrival_city, departure_city, ride_date, attempt_num)
    log_filename = os.path.join(log_dir, '{}.log'.format(base_name))
    data_filename = os.path.join(data_dir, '{}.csv'.format(base_name))
    html_filename = os.path.join(html_dir, '{}.html'.format(base_name))

    data = None
    try:
        download_start_time = datetime.now()
        html = download(arrival_city, departure_city, ride_date, adults)
        download_end_time = datetime.now()
        with open(html_filename, 'wb') as f:
            f.write(html)

        data = (
            process_page(html)
            .assign(
                departure_city=departure_city,
                departure_city_code=get_city_code(departure_city),
                arrival_city=arrival_city,
                arrival_city_code=get_city_code(arrival_city),
                scrape_time=scrape_time,
                download_start_time=download_start_time,
                download_end_time=download_end_time,
                adults=adults,
            )
        )
        data.to_csv(data_filename, index=False)
        logger.info(info_text)
        logger.info('    {}'.format(data_filename))
        logger.info('    total={}, available={}'.format(
            len(data), data['available'].sum(),
        ))
    except KeyboardInterrupt:
        raise
    except:
        logger.exception('error in item: {}'.format(info_text))
        os.makedirs(log_dir, exist_ok=True)
        with open(log_filename, 'w') as f:
            f.write(traceback.format_exc())
        raise
    return data


@retry(
    stop=stop_after_attempt(RETRY_MAX_ATTEMPTS),
    wait=wait_exponential(multiplier=RETRY_MIN_DELAY, max=RETRY_MAX_DELAY),
)
def run_with_retry(base_dir, scrape_time, item):
    run(
        base_dir,
        scrape_time=scrape_time,
        attempt_num=run_with_retry.retry.statistics['attempt_number'],
        **item
    )


def main(cities=DEFAULT_SCRAPE_CITIES, sample_days=DEFAULT_SAMPLE_DAYS):
    logging.basicConfig(level=logging.INFO)

    scrape_time = datetime.now()
    base_dir = os.path.join(DEFAULT_OUTPUT_DIR, scrape_time.isoformat())
    os.makedirs(base_dir, exist_ok=True)
    log_filename = os.path.join(base_dir, 'info.log')

    items = []
    for arrival_city in cities:
        for departure_city in cities:
            if arrival_city == departure_city:
                continue
            for days_from_now in sample_days:
                ride_date = (scrape_time + timedelta(days=days_from_now)).date()
                items.append({
                    'departure_city': departure_city,
                    'arrival_city': arrival_city,
                    'ride_date': ride_date,
                })

    with log_to_file(logging.getLogger(), log_filename):
        for item in items:
            try:
                run_with_retry(base_dir, scrape_time, item)
            except RetryError:
                logger.warning('Retry exceeded; skipping item')
