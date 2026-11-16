#!/usr/bin/env python3
"""Run a command in a pseudo-terminal of a given width and save what it printed.

    python3 tools/ptyrun.py COLS OUTFILE COMMAND [ARG...]

The command sees a terminal of COLS columns, so it picks its colours and its
width the way it does for a person at a terminal. The bytes it printed go to
OUTFILE unchanged; the exit code of the command is printed on stdout.
Used by tools/captures.mjs.
"""
import fcntl
import os
import pty
import select
import struct
import sys
import termios


def main():
    if len(sys.argv) < 4:
        sys.exit(__doc__.strip())
    cols, out, argv = int(sys.argv[1]), sys.argv[2], sys.argv[3:]
    pid, fd = pty.fork()
    if pid == 0:
        # Child: the pty is stdin, stdout and stderr. Set the size before exec.
        fcntl.ioctl(1, termios.TIOCSWINSZ, struct.pack('HHHH', 300, cols, 0, 0))
        try:
            os.execvp(argv[0], argv)
        except OSError as e:
            os.write(2, f'ptyrun: {argv[0]}: {e}\n'.encode())
            os._exit(127)
    data = bytearray()
    while True:
        try:
            ready, _, _ = select.select([fd], [], [], 60)
        except InterruptedError:
            continue
        if not ready:
            os.kill(pid, 9)
            sys.exit(f'ptyrun: {argv[0]} printed nothing for 60 s; stopped')
        try:
            chunk = os.read(fd, 65536)
        except OSError:  # EIO: the child closed the terminal
            break
        if not chunk:
            break
        data += chunk
    _, status = os.waitpid(pid, 0)
    with open(out, 'wb') as f:
        f.write(data)
    print(os.waitstatus_to_exitcode(status))


if __name__ == '__main__':
    main()
