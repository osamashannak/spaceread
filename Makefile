.DEFAULT_GOAL := help

COMPOSE ?= docker compose

.PHONY: help dev dev-detached seed reset reset-seed stop logs config

help:
	@echo "SpaceRead dev shortcuts"
	@echo "  make dev             Build and run the full local stack"
	@echo "  make dev-detached    Build and run the stack in the background"
	@echo "  make seed            Run dev data seeding once"
	@echo "  make reset           Stop the stack and delete local volumes"
	@echo "  make reset-seed      Reset volumes, start stack, then seed dev data"
	@echo "  make stop            Stop containers without deleting volumes"
	@echo "  make logs            Follow Docker compose logs"
	@echo "  make config          Render Docker compose config"

dev:
	$(COMPOSE) up --build

dev-detached:
	$(COMPOSE) up --build -d

seed:
	$(COMPOSE) --profile devdata build migrate seed
	$(COMPOSE) --profile devdata run --rm seed

reset:
	$(COMPOSE) down -v

reset-seed:
	$(COMPOSE) down -v
	$(COMPOSE) up --build -d
	$(COMPOSE) --profile devdata build seed
	$(COMPOSE) --profile devdata run --rm seed

stop:
	$(COMPOSE) down

logs:
	$(COMPOSE) logs -f

config:
	$(COMPOSE) config
