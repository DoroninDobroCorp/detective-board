## Systemd Service (always on)

This repo includes a service template to run the Vite dev server continuously, including its Telegram/OpenAI/Gemini middleware.

Prerequisites:
- Node 20+ and npm
- Completed `.env.local` with your tokens

Steps:
1) Copy the service file
```
sudo cp deploy/systemd/detective-board.service /etc/systemd/system/detective-board.service
```

2) Reload systemd and enable on boot
```
sudo systemctl daemon-reload
sudo systemctl enable detective-board
```

3) Start the service and check status
```
sudo systemctl start detective-board
systemctl status detective-board
```

4) Follow logs
```
journalctl -u detective-board -f
```

Notes:
- The service runs `npm run dev` and binds to `0.0.0.0:5173`. Adjust the port in the unit file if needed.
- For public access, ensure your firewall allows the chosen port (e.g., `ufw allow 5173/tcp`).
- If you want static build only (without dev middleware), use `npm run build` and serve `dist/` behind a simple HTTP server or reverse proxy. The dev-only API endpoints (`/api/tg/*`, `/api/openai/*`, `/api/google/*`) will not be available in preview/static mode.

Data bootstrap (optional):
- If you have an exported backup JSON (via Toolbar → ⤓ Экспорт базы), you can auto-import it on first launch by placing it at `public/bootstrap-backup.json`.
- On start, the app checks this file when the DB is empty; if found, it imports nodes/links/users/etc. and skips demo seeding.
- Example upload:
```
scp your-backup.json ubuntu@SERVER:/srv/detective-board/public/bootstrap-backup.json
sudo systemctl restart detective-board
```

