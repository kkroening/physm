import errno
import os
import subprocess


def _read_blob(blob_sha, db_uri='.git'):
    args = ['git', 'cat-file', 'blob', blob_sha]
    return subprocess.check_output(args, cwd=db_uri)


def _read_tree(tree_sha, db_uri='.git'):
    # TODO: make sure sha points to a tree and not something else.
    args = ['git', 'cat-file', '-p', tree_sha]
    lines = subprocess.check_output(args, cwd=db_uri).strip().split('\n')
    tree = {}
    for line in lines:
        info, filename = line.split('\t', 1)
        mode, type, sha = info.split(' ')
        tree[filename] = {'mode': mode, 'type': type, 'sha': sha}
    return tree


def _read_commit(commit_sha, db_uri='.git'):
    args = ['git', 'cat-file', 'commit', commit_sha]
    output = subprocess.check_output(args, cwd=db_uri)
    header, message = output.split('\n\n', 1)
    header_lines = header.split('\n')
    kv_pairs = [line.split(' ', 1) for line in header_lines]
    parents = [v for k, v in kv_pairs if k == 'parent']
    kv_pairs = [[k, v] for k, v in kv_pairs if k != 'parent']
    return dict(kv_pairs, parents=parents, message=message)


def _read_ref(ref, db_uri='.git'):
    try:
        with open(os.path.join(db_uri, ref)) as f:
            return f.read().strip()
    except IOError as e:
        if e.errno not in (errno.ENOENT, errno.ENOTDIR):
            raise


def _write_blob(blob, db_uri='.git'):
    args = ['git', 'hash-object', '-w', '--stdin']
    process = subprocess.Popen(args, stdin=subprocess.PIPE, stdout=subprocess.PIPE, cwd=db_uri)
    blob_sha = process.communicate(input=blob)[0].strip()
    retcode = process.poll()
    if retcode != 0:
        raise ValueError('bad retcode fixme')
    return blob_sha


def _write_tree(tree, db_uri='.git'):
    # git update-index --add --cacheinfo 100644 {blob_sha} {filename} && git write-tree
    for filename, info in tree.items():
        args = ['git', 'update-index', '--add', '--cacheinfo', info['mode'], info['sha'], filename]
        subprocess.check_call(args, cwd=db_uri)
    return subprocess.check_output(['git', 'write-tree'], cwd=db_uri).strip()


def _write_commit(tree_sha, parent_commit_sha=None, message='commit', db_uri='.git'):
    args = ['git', 'commit-tree', tree_sha]
    if parent_commit_sha is not None:
        args += ['-p', parent_commit_sha]
    process = subprocess.Popen(args, stdin=subprocess.PIPE, stdout=subprocess.PIPE, cwd=db_uri)
    commit_sha = process.communicate(input=message)[0].strip()
    retcode = process.poll()
    if retcode != 0:
        raise ValueError('bad retcode fixme')
    return commit_sha


def _write_ref(ref, commit_sha, prev_commit_sha=None, db_uri='.git'):
    args = ['git', 'update-ref', ref, commit_sha]
    if prev_commit_sha is not None:
        args.append(prev_commit_sha)
    subprocess.check_call(args, cwd=db_uri)


class Entity(object):
    def _get_ref(self):
        return 'refs/heads/values/{}'.format(self._key)

    def __init__(self, db, key, value=None):
        self._key = key
        self._db = db
        self.value = value

    @property
    def key(self):
        return self._key

    def get(self):
        commit_sha = _read_ref(self._get_ref(), db_uri=db.uri)
        if commit_sha is not None:
            commit = _read_commit(commit_sha, db_uri=db.uri)
            if commit is not None:
                tree = _read_tree(commit['tree'], db_uri=db.uri)
                if tree is not None and 'value' in tree:
                    value = _read_blob(tree['value']['sha'], db_uri=db.uri)
        self.value = value
        return self

    def put(self):
        ref = self._get_ref()
        blob_sha = _write_blob(self.value, db_uri=self._db.uri)
        tree = {'value': {'type': 'blob', 'mode': '100644', 'sha': blob_sha}}
        tree_sha = _write_tree(tree, db_uri=self._db.uri)
        for i in range(1):  # TODO: retry atomic ref update.
            parent_commit_sha = _read_ref(ref, db_uri=self._db.uri)
            commit_sha = _write_commit(tree_sha, parent_commit_sha, db_uri=self._db.uri)
            _write_ref(ref, commit_sha, parent_commit_sha, db_uri=self._db.uri)
        return self


class Db(object):
    def __init__(self, uri='.git'):
        self.uri = uri

    def get(self, key):
        return Entity(self, key).get()

    def put(self, key, value):
        return Entity(self, key, value).put()

    def put_multi(self, entities):
        pass


if __name__ == '__main__':
    db = Db()
    foo = db.put('foo', 'foo value')
    print(db.get('foo').value)
