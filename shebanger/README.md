# shebanger.py: ensure scripts run in virtualenv

## Usage:

1. Add the following shebang boilerplate to the top of your python script:
```
#!/usr/bin/env python
from os import path as __osp
exec(open(__osp.join(__osp.dirname(__osp.realpath(__file__)), 'shebanger.py')).read())
```

2. Make your script executable: `chmod +x somescript`.
3. Copy `shebanger.py` to the same directory that your script resides in.
4. Write depenedencies to `requirements.txt`.
5. Run your script directly, without any manual virtualenv setup: `./somescript`.

Note that this properly handles symlinks, e.g. `ln -s somescript ~/bin/foo; foo`.

## FAQ (frequently arising qualms):

### The boilerplate is ugly!

Yup, but it's better than requiring your users to manage virtualenvs.  Get over it.

### The boilerplate could be cleaner.

Probably.  Feel free to let me know how.  But if it doesn't properly handle symlinks it doesn't count.

### Why use `exec`?  Just put `.` on `sys.path` and do an import.

Let's not mess with `sys.path` any more than we have to.  `sys.path` is one of the nastiest parts of python, so leave it to `virtualenv` to mess with it.

And re: import: again, symlinks.

### Tool XYZ makes this unnecessary.

Probably.  Feel free to let me know about such tool.
