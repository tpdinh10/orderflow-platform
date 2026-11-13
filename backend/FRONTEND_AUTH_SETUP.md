# OrderFlow authentication integration

1. Back up your project. Copy `backend/`, `frontend/`, `compose.yaml`, and `.github/workflows/ci.yml` into your repository. Keep your existing `backend/.env` and database volume.
2. In the repository ROOT create `.env` containing `JWT_SECRET_KEY=<your-random-secret>`. Generate with `python -c "import secrets; print(secrets.token_urlsafe(48))"`. Do not commit this file. Add `.env` to root `.gitignore` if needed.
3. Run `docker compose up -d --build`. Then run `docker compose exec backend alembic upgrade head`.
4. Run `docker compose exec -it backend python create_user.py --email you@example.com --role admin` and choose a password of at least 12 characters.
5. Visit http://localhost:5173 and sign in. Admin can add products/cancel orders; staff can view and create orders.
6. Run backend tests against a separate `orderflow_test` DB and `npm run build` in frontend. Push only after tests pass.

Notes: JWT is held in memory (logging in again after page reload is expected). Use HTTPS and login rate limiting before public deployment. Never use development database credentials or privileged demo accounts for a public deployment.
