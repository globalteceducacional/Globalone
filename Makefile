local:
	bash scripts/start_local.sh

local-full:
	bash scripts/start_local_full.sh

prod:
	bash scripts/start_prod.sh

full:
	bash scripts/start_full.sh

gone-only:
	bash scripts/start_prod.sh

prepare-env:
	bash scripts/prepare_env.sh

prepare-env-full:
	bash scripts/prepare_env_full.sh

doctor:
	bash scripts/doctor.sh

status:
	bash scripts/status.sh

logs:
	bash scripts/logs.sh

stop:
	bash scripts/stop.sh

backup:
	bash scripts/backup.sh

reset-local:
	bash scripts/reset_local.sh
