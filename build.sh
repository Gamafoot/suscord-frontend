#!/bin/sh
set -e

docker build -t front .
docker run -d --rm -v ./dist:/app/dist front
