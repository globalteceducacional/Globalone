# Checklist para produção

- [ ] VPS criada.
- [ ] Portas 80/443 abertas.
- [ ] DNS dos quatro subdomínios apontando para a VPS.
- [ ] `.env` criado com `prepare_env.sh`.
- [ ] Domínios reais configurados no `.env`.
- [ ] Senhas padrão trocadas.
- [ ] `TECA_ADMIN_PASSWORD` anotada.
- [ ] `GEMINI_API_KEY` configurada, se desejar IA real.
- [ ] `bash scripts/doctor.sh` sem erro.
- [ ] `bash scripts/start_prod.sh` executado.
- [ ] `bash scripts/status.sh` mostra serviços ativos.
