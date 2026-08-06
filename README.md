# 🔥 Andrômeda — Painel de Resultados

App mobile (PWA) para acompanhar vendas da Kirvano, gasto com anúncios e lucro em tempo real.

- **PIN de 4 dígitos** com opção "manter conectado"
- **Webhook da Kirvano**: venda aprovada soma, reembolso/chargeback remove
- **Gasto de anúncios por dia**, editável a qualquer hora, com o **imposto de 12,15% do Facebook** calculado em separado
- Lucro = faturamento − (gasto de anúncio + 12,15%)
- Gráficos de evolução (7/15/30 dias) e horários de pico
- Comparação entre dois dias (ex.: dia 8 deste mês × dia 8 do mês passado)
- Importação de vendas antigas por CSV
- Notificação push a cada venda aprovada
- Instalável na tela de início do celular (PWA)

## Deploy no EasyPanel

1. Crie um novo serviço **App** apontando para este repositório do GitHub (branch `main`). O EasyPanel detecta o `Dockerfile` sozinho.
2. Em **Environment**, adicione:
   - `PIN` = seu PIN de 4 dígitos (ex.: `4823`)
3. Em **Mounts**, adicione um volume montado em `/app/data` (é onde fica o banco de dados — sem isso os dados somem a cada deploy!).
4. Configure o domínio apontando para a porta `3000`.
5. Deploy. Pronto.

## Configurar o webhook na Kirvano

Na Kirvano, em **Integrações → Webhooks**, cadastre:

```
https://SEU-DOMINIO/webhook/kirvano
```

Marque os eventos de **venda aprovada** e **reembolso/chargeback**. Não precisa de Pix gerado nem carrinho abandonado.

A URL exata também aparece dentro do app, na aba **Ajustes**.

## Importar vendas antigas

Exporte o CSV de vendas da Kirvano e cole o conteúdo na aba **Anúncios → Importar vendas antigas**. O app só importa vendas com status aprovado/pago e ignora duplicadas.

O CSV precisa ter cabeçalho com colunas de **data** e **valor** (nomes flexíveis: data/date, valor/preço/total, status).

## Notificações no iPhone

1. Abra o site no Safari
2. Compartilhar → **Adicionar à Tela de Início**
3. Abra o app pela tela de início e ative as notificações em **Ajustes**

## Rodar localmente

```bash
npm install
PIN=1234 npm start
```

Abre em http://localhost:3000 — PIN padrão `1234` se a variável não for definida.
