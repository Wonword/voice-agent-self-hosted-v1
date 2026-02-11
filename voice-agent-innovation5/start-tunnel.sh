#!/bin/bash
# Start Cloudflare Tunnel for voice1.artgenies.com

echo "🌐 Starting Cloudflare Tunnel for voice1.artgenies.com"
echo "========================================================"

cloudflared tunnel --config ~/.cloudflared/voice1.yml run
