#!/bin/bash
# Local policy test: fresh database, Supabase auth stand-in, all migrations, then the checks.
set -e
DIR="$(cd "$(dirname "$0")/.." && pwd)"
su postgres -c "dropdb --if-exists coinexa_test; createdb coinexa_test"
su postgres -c "psql -v ON_ERROR_STOP=1 -q -d coinexa_test -f $DIR/tests/auth_stub.sql"
for f in "$DIR"/migrations/*.sql; do su postgres -c "psql -v ON_ERROR_STOP=1 -q -d coinexa_test -f $f"; done
su postgres -c "cd $DIR && psql -q -d coinexa_test -f $DIR/tests/rls_test.sql" 2>&1 | grep -E "pass:|FAIL|ERROR|PASSED"
