#!/usr/bin/env bash

set -eu

sudo chown "$(id -u):$(id -g)" /var/www/html/node_modules
