import argparse
import os
import re
from http.server import SimpleHTTPRequestHandler, ThreadingHTTPServer
from pathlib import Path
from urllib.parse import urlsplit


class ProjectRequestHandler(SimpleHTTPRequestHandler):
    def do_GET(self):
        range_header = self.headers.get("Range")
        match = re.fullmatch(r"bytes=(\d*)-(\d*)", range_header or "")
        if match is None:
            return super().do_GET()

        path = Path(self.translate_path(urlsplit(self.path).path))
        if not path.is_file():
            return super().do_GET()

        size = path.stat().st_size
        first, last = match.groups()
        if first:
            start = int(first)
            end = min(int(last), size - 1) if last else size - 1
        elif last:
            suffix_length = int(last)
            start = max(0, size - suffix_length)
            end = size - 1
        else:
            return self._range_not_satisfiable(size)

        if start >= size or start > end:
            return self._range_not_satisfiable(size)

        length = end - start + 1
        self.send_response(206)
        self.send_header("Content-Type", self.guess_type(str(path)))
        self.send_header("Accept-Ranges", "bytes")
        self.send_header("Content-Range", f"bytes {start}-{end}/{size}")
        self.send_header("Content-Length", str(length))
        self.end_headers()

        try:
            with path.open("rb") as asset:
                asset.seek(start)
                remaining = length
                while remaining:
                    chunk = asset.read(min(64 * 1024, remaining))
                    if not chunk:
                        break
                    self.wfile.write(chunk)
                    remaining -= len(chunk)
        except (BrokenPipeError, ConnectionResetError):
            pass

    def _range_not_satisfiable(self, size):
        self.send_response(416)
        self.send_header("Content-Range", f"bytes */{size}")
        self.send_header("Content-Length", "0")
        self.end_headers()


def main():
    parser = argparse.ArgumentParser(description="Serve the local BPM Studio project.")
    parser.add_argument("--host", default="127.0.0.1")
    parser.add_argument("--port", type=int, default=8080)
    args = parser.parse_args()

    os.chdir(Path(__file__).resolve().parent)
    server = ThreadingHTTPServer((args.host, args.port), ProjectRequestHandler)
    server.daemon_threads = True
    print(f"BPM Studio: http://{args.host}:{args.port}/", flush=True)
    try:
        server.serve_forever()
    except KeyboardInterrupt:
        pass
    finally:
        server.server_close()


if __name__ == "__main__":
    main()
