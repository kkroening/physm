def get_url_params(url):
    params = {}
    i = url.find('?')
    if i == -1:
        i = len(url)
    base = url[:i]
    url = url[i+1:]

    while url != '':
        i = url.find('&')
        if i == -1:
            i = len(url)
    
        pair = url[:i]
        j = pair.find('=')
        if j < 0:
            raise Exception('Expected key-value pair for URL parameter: {}'.format(pair))
        key = pair[:j]
        value = pair[j+1:]
        params[key] = value

        url = url[i+1:]
    return base, params


def get_url(base, params):
    if len(params) == 0:
        return base
    pairs = ['{}={}'.format(k, params[k]) for k in params.keys()]
    return '{}?{}'.format(base, '&'.join(pairs))
