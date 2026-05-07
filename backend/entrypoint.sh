#!/bin/bash
set -e

# Load GITEA_TOKEN from file if not set in environment
if [ -z "$GITEA_TOKEN" ] && [ -f /shared/gitea-token.env ]; then
    echo "Loading GITEA_TOKEN from /shared/gitea-token.env"
    export $(cat /shared/gitea-token.env | xargs)
    echo "GITEA_TOKEN loaded: ${GITEA_TOKEN:0:8}..."
fi

if [ -z "$GITEA_TOKEN" ]; then
    echo "Warning: GITEA_TOKEN not set. Repository creation via API will not work."
fi

# Execute the main command
exec "$@"
