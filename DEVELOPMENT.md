# Development

## Requirements

- [Bun](https://bun.sh) - JavaScript runtime and package manager

## Setup

```bash
git clone https://github.com/damianb-bitflipper/proton-drive-sync
cd proton-drive-sync
make install
```

## Running Locally

The canonical way to develop is via the `make dev` command, which runs the app directly with bun in watch mode (auto-reload on file changes):

```bash
make dev
```

This runs `start --no-daemon` automatically. Use `Ctrl+C` to stop.

For one-off commands (like service install), use `make run`:

```bash
make run ARGS="service install"
```

## Make Commands

| Command           | Description                             |
| ----------------- | --------------------------------------- |
| `make install`    | Install dependencies                    |
| `make dev ARGS=…` | Run with auto-reload on file changes    |
| `make run ARGS=…` | Run one-off commands (builds first)     |
| `make pre-commit` | Run lint, format, and type-check        |
| `make db-inspect` | Open Drizzle Studio to inspect database |
| `make help`       | Show all available commands             |

## Publishing

To publish a new version:

1. Update version in `package.json`
2. Create a new release with the respective tag

The GitHub Actions release workflow will automatically build binaries for all platforms.

## Large Directory Support (Linux)

When syncing directories with many files (10,000+), you may need to increase
the Linux inotify watcher limit:

```bash
# Check current limit
cat /proc/sys/fs/inotify/max_user_watches

# Increase temporarily
sudo sysctl fs.inotify.max_user_watches=524288

# Increase permanently
echo "fs.inotify.max_user_watches=524288" | sudo tee -a /etc/sysctl.conf
sudo sysctl -p
```
