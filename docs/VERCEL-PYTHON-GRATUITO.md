# JPN — experimental Python solver on Vercel Hobby

This is an **optional deployment adapter** for development and non-commercial tests. It does not modify the calculation engine, its mathematical checks, or the current Next.js app. The Vercel **Hobby** plan is restricted to personal/non-commercial use; do not use it to deliver paid engineering services.

## Architecture

Deploy **two Vercel projects** from the same private GitHub repository:

- Existing **JPN**: repository root `/`, Framework **Next.js**, serves the user interface and the server-side `/api/analysis` and `/api/analysis3d` proxy routes.
- New **JPN solver**: Root Directory **`engine`**, Framework Preset **Other**, Python 3.12 (specified by `engine/pyproject.toml`). File-based Python functions `api/analyze.py` and `api/analyze3d.py` expose `/api/analyze` and `/api/analyze3d`.

The Python functions delegate to the **existing** `jpn_structural.service.Handler`, which validates a bearer token and runs the pinned 2D or 3D solver in a subprocess. The 3D solver remains PyNiteFEA 3.2.1. The existing input and output JSON envelopes, SHA-256 checks, 500 kB input limit, 2 MB 3D output limit, 20 second subprocess limit, and maximum 2 simultaneous workers **per Python function instance** remain. Serverless execution may scale to multiple instances: this is **not** a global concurrency quota or a guaranteed cost limit. The original service's timeout and concurrency checks remain in place.

## Configure the Python service (new Vercel project)

1. In Vercel, **Add New → Project** and import the existing private GitHub repository `brunoJuniorBrz/JPN` **again**; leave the existing `jpn-three` project unchanged.
2. Name the new project, for example, `jpn-structural-engine`.
3. Set **Root Directory** to **`engine`** (not `/`), Framework Preset **Other**. Keep the Python install/build defaults; `pyproject.toml` declares Python >=3.12,<3.13 and pins NumPy, SciPy and PyNiteFEA.
4. In **Environment Variables**, add `JPN_ANALYSIS_TOKEN` with a strong randomly-generated secret of at least 32 bytes. Apply to Production; add Preview only if you intentionally test preview deployments. Never commit the secret, embed it in the browser, or send it in a screenshot.
5. Deploy from a commit containing this directory. During deployment, verify Vercel detected two Python functions and installed the packages. If the wheel bundle exceeds a Vercel limit or there is a native-dependency error, **do not alter the physics or loosen validation to make it deploy**. Review the build log first.
6. Verify `GET https://<SOLVER-DOMAIN>/api/analyze3d` returns `status:ready`. This is just a deployment/health smoke check, **not** proof that a numerical solve works.
7. If the user account enabled Vercel Deployment Protection for this service, check that the server-side Next.js proxy can call the production service; a redirected login page will not work.

## Configure the existing JPN frontend (existing Vercel project)

In the existing project's **Settings → Environment Variables**, add these **server-side only**, for Production:

```text
JPN_SPATIAL_ANALYSIS_URL=https://<SOLVER-DOMAIN>/api/analyze3d
JPN_ANALYSIS_URL=https://<SOLVER-DOMAIN>/api/analyze
JPN_ANALYSIS_TOKEN=<THE-SAME-SECRET-USED-BY-THE-SOLVER>
```

Use only the **production deployment domain** returned by Vercel; do not use a temporary preview domain unless you intend to configure and maintain it. Do not add a `NEXT_PUBLIC_` prefix to these values. **Redeploy** the existing frontend after saving env vars.

## End-to-end verification (mandatory before claiming online analysis)

1. On desktop, open JPN → a project → **Preparar análise estrutural → 4. Conferência**.
2. Click **Carregar cobertura sintética validada 10 × 20 m** (132 nodes, 207 original pieces, 243 solver segments); this does **not** change the current project.
3. Click **Executar modelo integrado experimental**. Confirm a real HTTP 200 response with the expected result identity/hash, and check that the numeric outputs appear rather than `UNAVAILABLE`, `TIMEOUT`, `INVALID_RESPONSE`, or `SERVICE_FAILURE`.
4. Compare `TESTE-1` equilibrium residual (~9.7e-14) and maximum displacement (~0.0237006 mm) against the audited Windows synthetic reference. Platform floating-point differences are expected; they should be small and assessed before acceptance.
5. Test invalid/no-token requests to the Python function, stale data rejection, a structurally unstable example, and the 2D endpoint if exposed. Test the real mobile experience as well.
6. Check **Vercel Function Logs** for import errors, missing shared libraries, cold starts, subprocess restrictions and timeouts. The previous Windows timings (~7.36 seconds) are not a latency guarantee on Vercel Linux; the Next.js proxy currently has a 20-second fetch timeout and client aborts after 25 seconds.

## Security and limitations

- The Python endpoints require `JPN_ANALYSIS_TOKEN` for POST. If the token is **missing**, they fail closed (503), rather than exposing an anonymous computation service. GET is a health check, and never reveals the token.
- Treat the token as a service-to-service secret, **not user authentication**. The frontend project currently has no production-grade end-user login or globally enforced user quota; public access may exhaust free compute allotments. Monitor usage and restrict exposure until properly secured.
- Vercel Hobby usage is free within its published quotas and **personal, non-commercial only**; reaching quota or deploying for commercial work requires a different arrangement. Exact bundle/time/resource limits depend on the project's current Vercel configuration.
- No deployment from this branch has been verified by the author. Passing local tests cannot establish Vercel build/runtime compatibility, especially native PyNiteFEA/NumPy/SciPy wheels and subprocess behavior. Mark end-to-end tests as **pending** until a real deployed solve passes.
- The solver remains **experimental**. No automatic self-weight/wind, axial/mixed models, normative ABNT design, resistance verification or approval for construction. Do not use its synthetic reference for fabrication.

## Sources

- https://vercel.com/docs/functions/runtimes/python/api-directory
- https://vercel.com/docs/functions/runtimes/python
- https://vercel.com/docs/monorepos
- https://vercel.com/docs/plans/hobby
