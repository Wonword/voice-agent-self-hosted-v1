#!/bin/bash
# Setup Cloudflare Tunnel for voice1.artgenies.com
# This script creates and configures a new Cloudflare tunnel

echo "🌐 Setting up Cloudflare Tunnel for voice1.artgenies.com"
echo "========================================================"

# Check if cloudflared is installed
if ! command -v cloudflared &> /dev/null; then
    echo "❌ cloudflared not found. Installing..."
    brew install cloudflared
fi

# Create the tunnel
echo "📦 Creating tunnel 'artgenies-voice1'..."
cloudflared tunnel create artgenies-voice1

# Get the tunnel ID
TUNNEL_ID=$(cloudflared tunnel list | grep artgenies-voice1 | awk '{print $1}')
echo "✅ Tunnel ID: $TUNNEL_ID"

# Update the config file with the tunnel ID
CONFIG_FILE="/Users/obiwon/.cloudflared/voice1.yml"
if [ -f "$CONFIG_FILE" ]; then
    sed -i '' "s/<TUNNEL_ID_TO_BE_CONFIGURED>/$TUNNEL_ID/g" "$CONFIG_FILE"
    echo "✅ Updated config file with tunnel ID"
fi

# Create DNS route
echo "🌐 Creating DNS route for voice1.artgenies.com..."
cloudflared tunnel route dns artgenies-voice1 voice1.artgenies.com

echo ""
echo "✅ Setup complete!"
echo ""
echo "To start the tunnel, run:"
echo "  cloudflared tunnel --config ~/.cloudflared/voice1.yml run"
echo ""
echo "Or use the start script:"
echo "  ./start-tunnel.sh"
