# 2048-AI
A fork of [2048](http://gabrielecirulli.github.io/2048/)

Made just for fun. [Play it here!](http://aj-r.github.io/2048-AI/)

## Running locally

This is a client-side-only, static site (no backend, no build step, no
package manager) — you can just open `index.html` directly in a browser.

To instead serve it over `http://localhost` (e.g. for testing behavior
that requires a real origin), start/stop scripts are provided that wrap
Python's built-in static file server and record its PID to `pid.txt`, so
you don't have to hunt down the port/PID yourself to shut it down:

```sh
# PowerShell
./start.ps1          # serves on http://localhost:8000 (add -Port to override)
./stop.ps1

# sh / bash
./start.sh            # serves on http://localhost:8000 (pass a port as $1 to override)
./stop.sh
```

