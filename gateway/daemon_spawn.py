#!/data/data/com.termux/files/usr/bin/python3
import os
import sys

def daemonize(cmd, log_file, pid_file):
    if os.fork() > 0:
        sys.exit(0)
    os.setsid()
    if os.fork() > 0:
        sys.exit(0)

    sys.stdout.flush()
    sys.stderr.flush()

    with open(os.devnull, 'r') as devnull:
        os.dup2(devnull.fileno(), sys.stdin.fileno())

    log_fd = open(log_file, 'a')
    os.dup2(log_fd.fileno(), sys.stdout.fileno())
    os.dup2(log_fd.fileno(), sys.stderr.fileno())

    with open(pid_file, 'w') as f:
        f.write(str(os.getpid()))

    # Propagate SSL certificate paths to child environment for Go / glibc
    prefix = os.environ.get("PREFIX", "/data/data/com.termux/files/usr")
    cert_file = os.path.join(prefix, "etc/tls/cert.pem")
    if os.path.exists(cert_file):
        os.environ["SSL_CERT_FILE"] = cert_file
        os.environ["SSL_CERT_DIR"] = os.path.join(prefix, "etc/ssl/certs")

    try:
        os.execvp(cmd[0], cmd)
    except Exception as e:
        sys.stderr.write(f"Failed to exec {cmd}: {e}\n")
        sys.exit(1)

if __name__ == '__main__':
    if len(sys.argv) < 4:
        sys.exit(1)
    daemonize(sys.argv[3:], sys.argv[2], sys.argv[1])
