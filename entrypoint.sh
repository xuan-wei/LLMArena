#!/bin/sh
set -e

# If no DB exists at the mount point, copy the empty template (schema pre-applied at build time)
if [ ! -f /data/arena.db ]; then
  echo "No database found, initializing from template..."
  cp /app/template.db /data/arena.db
else
  echo "Database already exists, skipping initialization."
fi

echo "Starting server..."
exec node server.js
