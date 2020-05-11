from utils import get_url_params, get_url
import json

from js import (
    console,
    document,
    jquery,
    window,
)


class FakeConsole(object):
    def log(self, text):
        node = document.createElement('li')
        text_node = document.createTextNode(text)
        node.appendChild(text_node)
        document.getElementById('container').appendChild(node)

#console = FakeConsole()


CREATE_LIVE_VIDEO_ACTION = 'create-live-video'
DEFAULT_ACTION = 'default'
REACTION_COUNT_ACTION = 'reaction-count'
GET_STUFF_ACTION = 'get-stuff'

REACTION_NAMES = ['like', 'love', 'haha', 'wow', 'sad', 'angry']


BASE_URL, URL_PARAMS = get_url_params(window.location.href)
APP_ID = '210747139374329'
ACTION = URL_PARAMS.get('action', 'default')
SCOPE = 'publish_actions'


container = jquery('#container')
access_token = None
login_status_base64 = URL_PARAMS.get('login_status')
login_status_text = window.atob(login_status_base64) if login_status_base64 else None
login_status = json.loads(login_status_text) if login_status_text else None
fb = None


def get_action_url(action, params, include_login_status=True):
    actual_params = {
        'action': action,
    }
    if include_login_status:
        actual_params['login_status'] = window.btoa(json.dumps(login_status))
    actual_params.update(params)
    return get_url(BASE_URL, actual_params)


def show_video_info(video_id, stream_url):
    get_stuff_url = get_action_url(GET_STUFF_ACTION, {'video_id': video_id})

    div = jquery('#video-info')
    div.css('display', 'block')
    jquery('#video-id', div).text(video_id)
    jquery('#stream-url', div).text(stream_url)
    jquery('#get-stuff-url', div).attr('href', get_stuff_url)
    for reaction_name in REACTION_NAMES:
        url = get_action_url(REACTION_COUNT_ACTION, {'video_id': video_id, 'reaction_name': reaction_name})
        jquery('#{}-count-url'.format(reaction_name), div).attr('href', url)


class Action(object):
    def run():
        raise NotImplementedError()


class DefaultAction(Action):
    def __init__(self, div):
        self.div = div

    def run(self):
        video_id = URL_PARAMS.get('video_id')
        create_live_video_url = get_action_url(CREATE_LIVE_VIDEO_ACTION, {})

        jquery('#access-token', self.div).text(access_token)
        jquery('#create-live-video-url', self.div).attr('href', create_live_video_url)
        if video_id is not None:
            show_video_info(video_id, None)


class CreateLiveVideoAction(Action):
    def __init__(self, div):
        pass

    def handle_result(self, response):
        console.log(response)
        video_id = response['id']
        stream_url = response['stream_url']
        show_video_info(video_id, stream_url)

    def run(self):
        fb.api('/me/live_videos', 'post', self.handle_result)


class GetStuffAction(Action):
    def __init__(self, div):
        self.video_id = URL_PARAMS.get('video_id')
        if self.video_id is None:
            raise Exception('Missing video_id param')

    def handle_comments(self, response):
        console.log('got comments')
        console.log(response)
        window.setTimeout(self.get_comments, 1000)

    def handle_reactions(self, response):
        console.log('got reactions')
        console.log(response)
        window.setTimeout(self.get_reactions, 1000)

    def get_comments(self):
        fb.api('/{}/comments'.format(self.video_id), 'get', self.handle_comments)

    def get_reactions(self):
        fb.api('/{}/reactions'.format(self.video_id), 'get', self.handle_reactions)

    def run(self):
        self.get_comments()
        self.get_reactions()


class ReactionCountAction(Action):
    def __init__(self, div):
        self.div = div
        self.video_id = URL_PARAMS.get('video_id')
        self.reaction_name = URL_PARAMS.get('reaction_name', 'like')

        if self.video_id is None:
            raise Exception('Missing video_id param')

    def handle_reactions(self, response):
        #console.log('got reactions')
        console.log(response)
        if 'data' in response:
            reaction_count = len([x for x in response['data'] if x['type'].lower() == self.reaction_name])
            jquery('#reaction-count', self.div).text(str(reaction_count))
        window.setTimeout(self.get_reactions, 1000)

    def get_reactions(self):
        fb.api('/{}/reactions'.format(self.video_id), 'get', self.handle_reactions)

    def run(self):
        self.get_reactions()


ACTION_CLASSES = {
    CREATE_LIVE_VIDEO_ACTION: CreateLiveVideoAction,
    DEFAULT_ACTION: DefaultAction,
    GET_STUFF_ACTION: GetStuffAction,
    REACTION_COUNT_ACTION: ReactionCountAction,
}


def run_action():
    action_class = ACTION_CLASSES.get(ACTION, DefaultAction)
    if action_class is None:
        document.write('Invalid action: {}'.format(ACTION))

    div = jquery('.{}-action'.format(ACTION))
    div.css('display', 'block')
    action = action_class(div)
    action.run()


def handle_login(response, show_message=True):
    response = dict(response)
    if not response.get('authResponse'):
        console.log('Login failed')
    else:
        global access_token, login_status

        if show_message:
            console.log('Logged in')

        login_status = window.fb_login_status
        access_token = response['authResponse']['accessToken']

        console.log(response)
        console.log('accessToken: ' + access_token);

        run_action()


def handle_login_status(response):
    if response and response['status'] == 'connected':
        console.log('Already logged in')
        handle_login(response, False)
    else:
        console.log('Logging in...')
        fb.login(handle_login, {'scope': SCOPE})


def init():
    if login_status is not None:
        #console.log('Setting login status')
        #console.log(login_status)
        window.fb_login_status = login_status

    global fb
    fb = window.FB
    fb.init({
        'appId': APP_ID,
        'xfbml': True,
        'version': 'v2.8',
        'status': True,
    })

    fb.AppEvents.logPageView()
    fb.getLoginStatus(handle_login_status)


window.fbAsyncInit = init
