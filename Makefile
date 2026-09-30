.PHONY: bootstrap build check dev infra-up infra-down migrate

bootstrap:
	pnpm install --frozen-lockfile
	cd apps/workflow && uv sync --frozen

build:
	pnpm build

check:
	pnpm check

dev:
	pnpm dev

infra-up:
	pnpm infra:up

infra-down:
	pnpm infra:down

migrate:
	pnpm --filter @canlearn/api db:migrate
