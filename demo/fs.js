// An in-memory file system for Go's os in a web page, in the shape of Node's fs that Go's
// syscall/fs_js.go calls, loaded before wasm_exec.js so it takes this one. Everything is
// gone with the page. Paths are absolute; the core names only absolute ones.
(() => {
  const S_IFDIR = 0o040000;
  const S_IFREG = 0o100000;
  const err = (code) => Object.assign(new Error(code), { code });
  const nodes = new Map([['/', { dir: true, mtime: Date.now() }]]);
  const fds = new Map();
  let nextFD = 10;
  const decoder = new TextDecoder();
  let out = '';

  const norm = (p) => {
    const parts = [];
    for (const s of String(p).split('/')) {
      if (s === '' || s === '.') continue;
      if (s === '..') parts.pop();
      else parts.push(s);
    }
    return '/' + parts.join('/');
  };
  const parent = (p) => (p === '/' ? '/' : p.slice(0, p.lastIndexOf('/')) || '/');
  const stat = (n, ino) => {
    const size = n.dir ? 4096 : n.size;
    return {
      dev: 1, ino, mode: n.dir ? S_IFDIR | 0o755 : S_IFREG | 0o644, nlink: 1, uid: 0, gid: 0, rdev: 0,
      size, blksize: 4096, blocks: Math.ceil(size / 512), atimeMs: n.mtime, mtimeMs: n.mtime, ctimeMs: n.mtime,
      isDirectory: () => !!n.dir,
    };
  };
  const inos = new WeakMap();
  let nextIno = 1;
  const inoOf = (n) => inos.get(n) || (inos.set(n, nextIno++), inos.get(n));
  const grow = (n, size) => {
    if (n.data.length < size) {
      const d = new Uint8Array(Math.max(size, n.data.length * 2, 256));
      d.set(n.data.subarray(0, n.size));
      n.data = d;
    }
  };
  const C = { O_RDONLY: 0, O_WRONLY: 1, O_RDWR: 2, O_CREAT: 64, O_EXCL: 128, O_TRUNC: 512, O_APPEND: 1024, O_DIRECTORY: 65536 };

  const fs = {
    constants: C,
    writeSync(fd, buf) {
      if (fd === 1 || fd === 2) {
        out += decoder.decode(buf);
        const nl = out.lastIndexOf('\n');
        if (nl !== -1) {
          console.log(out.substring(0, nl));
          out = out.substring(nl + 1);
        }
        return buf.length;
      }
      throw err('EBADF');
    },
    open(path, flags, mode, cb) {
      const p = norm(path);
      let n = nodes.get(p);
      if (n) {
        if (flags & C.O_CREAT && flags & C.O_EXCL) return cb(err('EEXIST'));
        if (n.dir && flags & (C.O_WRONLY | C.O_RDWR)) return cb(err('EISDIR'));
        if (flags & C.O_TRUNC && !n.dir) n.size = 0;
      } else {
        if (!(flags & C.O_CREAT)) return cb(err('ENOENT'));
        const dir = nodes.get(parent(p));
        if (!dir || !dir.dir) return cb(err('ENOENT'));
        n = { data: new Uint8Array(0), size: 0, mtime: Date.now() };
        nodes.set(p, n);
      }
      if (flags & C.O_DIRECTORY && !n.dir) return cb(err('ENOTDIR'));
      const fd = nextFD++;
      fds.set(fd, { path: p, node: n, pos: 0, append: !!(flags & C.O_APPEND) });
      cb(null, fd);
    },
    close(fd, cb) {
      if (!fds.delete(fd)) return cb(err('EBADF'));
      cb(null);
    },
    read(fd, buf, off, len, pos, cb) {
      const f = fds.get(fd);
      if (!f) return cb(err('EBADF'));
      if (f.node.dir) return cb(err('EISDIR'));
      const at = pos === null || pos === undefined ? f.pos : pos;
      const n = Math.max(0, Math.min(len, f.node.size - at));
      buf.set(f.node.data.subarray(at, at + n), off);
      if (pos === null || pos === undefined) f.pos += n;
      cb(null, n);
    },
    write(fd, buf, off, len, pos, cb) {
      if (fd === 1 || fd === 2) return cb(null, fs.writeSync(fd, buf.subarray(off, off + len)));
      const f = fds.get(fd);
      if (!f) return cb(err('EBADF'));
      const n = f.node;
      const at = f.append ? n.size : pos === null || pos === undefined ? f.pos : pos;
      grow(n, at + len);
      n.data.set(buf.subarray(off, off + len), at);
      n.size = Math.max(n.size, at + len);
      n.mtime = Date.now();
      if (pos === null || pos === undefined) f.pos = at + len;
      cb(null, len);
    },
    fstat(fd, cb) {
      const f = fds.get(fd);
      if (!f) return cb(err('EBADF'));
      cb(null, stat(f.node, inoOf(f.node)));
    },
    stat(path, cb) {
      const n = nodes.get(norm(path));
      if (!n) return cb(err('ENOENT'));
      cb(null, stat(n, inoOf(n)));
    },
    lstat(path, cb) { fs.stat(path, cb); },
    mkdir(path, perm, cb) {
      const p = norm(path);
      if (nodes.has(p)) return cb(err('EEXIST'));
      const dir = nodes.get(parent(p));
      if (!dir || !dir.dir) return cb(err('ENOENT'));
      nodes.set(p, { dir: true, mtime: Date.now() });
      cb(null);
    },
    readdir(path, cb) {
      const p = norm(path);
      const n = nodes.get(p);
      if (!n) return cb(err('ENOENT'));
      if (!n.dir) return cb(err('ENOTDIR'));
      const prefix = p === '/' ? '/' : p + '/';
      const names = [];
      for (const k of nodes.keys()) {
        if (k !== p && k.startsWith(prefix) && !k.slice(prefix.length).includes('/')) names.push(k.slice(prefix.length));
      }
      cb(null, names);
    },
    rename(from, to, cb) {
      const a = norm(from);
      const b = norm(to);
      const n = nodes.get(a);
      if (!n) return cb(err('ENOENT'));
      if (!nodes.get(parent(b))) return cb(err('ENOENT'));
      if (a === b) return cb(null);
      for (const [k, v] of [...nodes]) {
        if (k === a || k.startsWith(a + '/')) {
          nodes.delete(k);
          nodes.set(b + k.slice(a.length), v);
        }
      }
      for (const f of fds.values()) if (f.path === a) f.path = b;
      cb(null);
    },
    unlink(path, cb) {
      const p = norm(path);
      const n = nodes.get(p);
      if (!n) return cb(err('ENOENT'));
      if (n.dir) return cb(err('EISDIR'));
      nodes.delete(p);
      cb(null);
    },
    rmdir(path, cb) {
      const p = norm(path);
      const n = nodes.get(p);
      if (!n) return cb(err('ENOENT'));
      if (!n.dir) return cb(err('ENOTDIR'));
      for (const k of nodes.keys()) if (k.startsWith(p + '/')) return cb(err('ENOTEMPTY'));
      nodes.delete(p);
      cb(null);
    },
    fsync(fd, cb) { cb(null); },
    ftruncate(fd, len, cb) {
      const f = fds.get(fd);
      if (!f) return cb(err('EBADF'));
      grow(f.node, len);
      if (len > f.node.size) f.node.data.fill(0, f.node.size, len);
      f.node.size = len;
      cb(null);
    },
    truncate(path, len, cb) {
      fs.open(path, C.O_RDWR, 0, (e, fd) => (e ? cb(e) : fs.ftruncate(fd, len, (e2) => fs.close(fd, () => cb(e2)))));
    },
    chmod(path, mode, cb) { cb(nodes.has(norm(path)) ? null : err('ENOENT')); },
    fchmod(fd, mode, cb) { cb(null); },
    chown(path, uid, gid, cb) { cb(null); },
    fchown(fd, uid, gid, cb) { cb(null); },
    lchown(path, uid, gid, cb) { cb(null); },
    utimes(path, atime, mtime, cb) {
      const n = nodes.get(norm(path));
      if (!n) return cb(err('ENOENT'));
      n.mtime = mtime * 1000;
      cb(null);
    },
    readlink(path, cb) { cb(err('EINVAL')); },
    symlink(path, link, cb) { cb(err('ENOSYS')); },
    link(path, link, cb) { cb(err('ENOSYS')); },
  };
  globalThis.fs = fs;
  globalThis.process = {
    getuid: () => -1, getgid: () => -1, geteuid: () => -1, getegid: () => -1,
    getgroups() { throw err('ENOSYS'); },
    pid: -1, ppid: -1,
    umask: () => 0o022,
    cwd: () => '/',
    chdir() { throw err('ENOSYS'); },
  };
})();
