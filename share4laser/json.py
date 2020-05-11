from js import JSON

def dumps(x, indent=None):
    #return JSON.stringify(x, None, indent)
    return JSON.stringify(x)


def loads(x):
    return JSON.parse(x)
