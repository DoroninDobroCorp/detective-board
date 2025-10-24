# Detective Board - Auto-Restart Setup

## 📅 Date: 2025-10-24

## 🎯 Problem

The Detective Board frontend (Vite dev server on port 5173) was experiencing crashes:
- **08:47 UTC**: Service down for 55 minutes
- **08:55 UTC**: Service down for 3 minutes  
- **Cause**: Service was running manually without auto-restart

## ✅ Solution Implemented

### 1. Created systemd Service

Created `/etc/systemd/system/detective-board.service` with:

```ini
[Unit]
Description=Detective Board - Vite Dev Server
After=network.target

[Service]
Type=simple
User=ubuntu
WorkingDirectory=/srv/detective-board
Environment="NODE_ENV=development"
Environment="PATH=/usr/local/bin:/usr/bin:/bin"
ExecStart=/usr/bin/npm run dev -- --host 0.0.0.0 --port 5173

# Auto-restart configuration
Restart=always
RestartSec=5
StartLimitInterval=200
StartLimitBurst=5

# Logs
StandardOutput=journal
StandardError=journal
SyslogIdentifier=detective-board

# Resource limits
LimitNOFILE=65536

[Install]
WantedBy=multi-user.target
```

### 2. Auto-Restart Configuration

- **Restart=always**: Service will restart on any failure
- **RestartSec=5**: Wait 5 seconds before restarting
- **StartLimitBurst=5**: Allow up to 5 restarts in the interval
- **StartLimitInterval=200**: 200 second window for burst limit

### 3. Service Management

The service is now:
- ✅ Enabled (starts on boot)
- ✅ Active and running
- ✅ Auto-restarts on crash
- ✅ Logs to systemd journal

## 🔧 Useful Commands

### Check Status
```bash
./check-service.sh
```

### Manual Control
```bash
# Start
sudo systemctl start detective-board.service

# Stop
sudo systemctl stop detective-board.service

# Restart
sudo systemctl restart detective-board.service

# View status
systemctl status detective-board.service

# View logs (live)
journalctl -u detective-board.service -f

# View recent logs
journalctl -u detective-board.service -n 50 --no-pager
```

## 🌐 Access URLs

- **Local**: http://localhost:5173/detective-board/
- **Network**: http://145.239.82.124:5173/detective-board/

## 📊 Service Statistics

The service automatically tracks:
- Restart count (view in `systemctl status`)
- CPU usage
- Memory usage (peak and current)
- Uptime

## 🔍 Monitoring

The service logs all output to systemd journal:
```bash
journalctl -u detective-board.service -f
```

All Vite logs, errors, and warnings are captured and timestamped.

## ⚙️ Similar Setup: VibeCoder Bot

The VibeCoder Dream bot (`/srv/VibeCoder_Dream`) already has a similar auto-restart service:
- Service file: `/etc/systemd/system/vibecoder-agent2.service`
- Auto-restart: Enabled with 10 second delay
- Status: Active and running

## 📝 Notes

1. The service runs as user `ubuntu`
2. Working directory is `/srv/detective-board`
3. Vite dev server binds to `0.0.0.0:5173` (accessible externally)
4. All npm dependencies must be installed before service starts
5. Service will auto-start on system reboot

## ✅ Verification

After setup:
```bash
# 1. Check service is running
systemctl status detective-board.service

# 2. Check HTTP response
curl -I http://localhost:5173/detective-board/

# 3. Test auto-restart (will restart automatically)
sudo systemctl kill -s SIGKILL detective-board.service

# 4. Verify it restarted (wait 5 seconds)
sleep 5 && systemctl status detective-board.service
```

## 🎉 Result

The Detective Board will now:
- ✅ Automatically restart on crash
- ✅ Start on system boot  
- ✅ Log all errors for debugging
- ✅ Recover from failures within 5 seconds
- ✅ Prevent extended downtimes
