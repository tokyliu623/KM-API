#!/bin/bash
set -e
echo "Building KM-API..."
docker-compose build
echo "Starting KM-API..."
docker-compose up -d
echo "KM-API started on port 5052"