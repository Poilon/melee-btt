"""Extract only a bounded, regular-file TTRC archive into a fresh staging directory."""
from pathlib import Path, PurePosixPath
import sys, zipfile, stat
archive, destination = map(Path, sys.argv[1:])
with zipfile.ZipFile(archive) as source:
    entries = source.infolist()
    if len(entries) > 25000 or sum(i.file_size for i in entries) > 2_000_000_000:
        raise ValueError('Update archive is too large')
    names = set()
    for entry in entries:
        name = entry.filename
        path = PurePosixPath(name)
        if (not name.startswith('TTRC/') or '\\' in name or ':' in name
                or any(p in ('.', '..') or p.endswith((' ', '.')) for p in name.rstrip('/').split('/'))
                or path.is_absolute() or stat.S_ISLNK(entry.external_attr >> 16)
                or name.lower() in names):
            raise ValueError('Unsafe update archive entry')
        names.add(name.lower())
    source.extractall(destination)
