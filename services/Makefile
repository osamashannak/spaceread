.DEFAULT_GOAL := help

MIGRATE ?= go run ./cmd/migrate
SEED ?= go run ./cmd/seed
NAME ?= $(name)
STEPS ?= 1
VERSION ?= 1

.PHONY: help test fmt tidy run-admin run-course run-professor seed migrate-create migrate-up migrate-down migrate-steps migrate-force migrate-version

help:
	@echo "Backend shortcuts"
	@echo "  make test                         Run Go tests"
	@echo "  make fmt                          Format Go files"
	@echo "  make tidy                         Tidy Go modules"
	@echo "  make run-admin                    Run admin API"
	@echo "  make run-professor                Run professor API"
	@echo "  make run-course                   Run course API"
	@echo "  make seed                         Seed the configured local development DB"
	@echo "  make migrate-create NAME=<name>   Create up/down migration files"
	@echo "  make migrate-up                   Apply pending migrations"
	@echo "  make migrate-down STEPS=1         Roll back migrations"
	@echo "  make migrate-steps STEPS=-1       Move a signed number of migrations"
	@echo "  make migrate-force VERSION=1      Mark a migration version as applied"
	@echo "  make migrate-version              Show current migration version"

test:
	go test ./...

fmt:
	gofmt -w ./cmd ./internal ./pkg

tidy:
	go mod tidy

run-admin:
	go run ./cmd/admin

run-course:
	go run ./cmd/course

run-professor:
	go run ./cmd/professor

seed:
	$(SEED) --allow-dev

migrate-create:
	$(MIGRATE) create $(NAME)

migrate-up:
	$(MIGRATE) up

migrate-down:
	$(MIGRATE) down $(STEPS)

migrate-steps:
	$(MIGRATE) steps $(STEPS)

migrate-force:
	$(MIGRATE) force $(VERSION)

migrate-version:
	$(MIGRATE) version
