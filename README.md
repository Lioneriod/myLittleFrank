# My Little Frank
## Sobre o MLF (My Little Frank)
### Por que criamos este aplicativo
Este é um aplicativo de "cuidados com um animal de estimação virtual", misturado com o fortalecimento do vínculo entre pais e filhos. A ideia principal é que os usuários compartilhem um animal de estimação e, por meio das interações com ele, conheçam mais um ao outro e interajam entre si. Criamos esse app como suporte para famílias que não podem estar juntas o tempo todo, facilitando interações rápidas enquanto trabalham ou estão ausentes. Não é algo que substitua a forma como se relacionam, mas sim uma ferramenta de apoio à relação deles.

### Por que o aplicativo se chama My Little Frank?
Ambos os desenvolvedores deste projeto são grandes fãs de horror, Halloween e terror. E, como somos mais motivados quando estamos nos divertindo, decidimos usar esses temas em nosso projeto. Este aplicativo foi criado para que os usuários cuidem de um pequeno "monstro de Frankenstein", que pode ser personalizado usando agulha, linha e várias partes monstruosas do corpo!

### Informações técnicas
Este é um projeto [Expo](https://expo.dev). Utilizamos o projeto [Helia](https://github.com/Rodrigo322/helia-youtube), desenvolvido por [Rodrigo322](https://github.com/Rodrigo322), como base e referência inicial.

#### Front-end
- Expo
- React Native
- React Navigation
- TypeScript
- Jest
- React Native Reanimated
- Node.js (para instalar as dependências e rodar o Expo)
- Expo SecureStore, para guardar o token de login no celular
- AsyncStorage, para guardar as partes do Frank e as configurações
- Expo Notifications, para as notificações push

#### Back-end
- Node.js 22
- Express 5
- TypeScript
- PostgreSQL (hospedado no Supabase), acessado com o node-postgres (`pg`)
- bcryptjs, para criptografar as senhas
- Vitest, Supertest e PGlite, para os testes
- Render, para hospedar a API

## Como o back-end funciona
O back-end é uma API REST em Node.js que roda no [Render](https://render.com), separada do app. O app não tem nenhuma chave do banco: ele só conhece o endereço da API e conversa com ela por HTTPS. Só a API acessa o PostgreSQL.

```
App (Expo)  --HTTPS + token-->  API (Node + Express no Render)  --SQL-->  PostgreSQL (Supabase)
```

O caminho de uma requisição:

1. O app chama uma rota, por exemplo `POST /api/monsters/join`, mandando o token no cabeçalho `Authorization: Bearer <token>`.
2. O `requireUser` (`backend/src/auth/middleware.ts`) procura o token na tabela `user_tokens`. Se ele não existir ou tiver vencido, a API responde `401` e o pedido para ali.
3. A rota (`backend/src/routes/`) lê o corpo do pedido e chama o serviço certo.
4. O serviço (`backend/src/services/`) valida os dados, confere se a pessoa cuida daquele monstrinho e faz as consultas SQL. As operações com mais de um passo (criar monstrinho, entrar pelo código, responder e avançar a pergunta) rodam numa transação.
5. A API responde em JSON. Os erros têm sempre o formato `{"error": "codigo", "message": "mensagem em português"}`, e o app mostra a mensagem.

### Login e tokens
- No cadastro, a senha vira um hash bcrypt no servidor. A senha original nunca é guardada.
- No cadastro e no login, a API gera um token aleatório de 32 bytes, guarda só o hash SHA-256 dele na tabela `user_tokens` e devolve o token ao app. O token vale 30 dias.
- O app guarda o token no SecureStore e manda em todas as requisições. Se a API responder `401`, o app apaga a sessão e volta para o login.
- Sair (`POST /api/auth/logout`) apaga o token no banco, então ele para de funcionar na hora.
- O login aceita 10 tentativas a cada 5 minutos por IP e e-mail. Depois disso, responde `429`.

### Estrutura da pasta `backend/`
```
backend/
├── .env.example          modelo do arquivo .env
├── src/
│   ├── server.ts         lê o .env, confere o banco e sobe o servidor
│   ├── app.ts            monta o Express: CORS, JSON, rotas e tratamento de erros
│   ├── env.ts            lê e valida as variáveis de ambiente
│   ├── db.ts             conexão com o PostgreSQL e transações
│   ├── errors.ts         códigos de erro e mensagens em português
│   ├── validation.ts     validação do corpo das requisições
│   ├── rateLimiter.ts    limite de tentativas
│   ├── auth/             senhas, tokens e o middleware requireUser
│   ├── routes/           uma rota por arquivo: auth, account, monsters, pushTokens
│   └── services/         as regras: accounts, monsters, pairing, push
└── test/                 testes das rotas
```

No app, a pasta `src/api/` é o cliente da API: `client.ts` faz as requisições, `session.ts` guarda o token, e os outros arquivos têm uma função para cada rota.

### Rotas da API

| Método | Rota | Login | O que faz |
|--------|------|-------|-----------|
| GET | `/health` | não | Confere se a API está no ar |
| POST | `/api/auth/register` | não | Cria a conta: `{email, password}` → `201 {token, user}` |
| POST | `/api/auth/login` | não | Entra: `{email, password}` → `{token, user}` |
| GET | `/api/auth/me` | sim | Dados de quem está logado |
| POST | `/api/auth/logout` | sim | Invalida o token usado (`204`) |
| DELETE | `/api/account` | sim | Apaga a conta e o monstrinho que a pessoa criou (`204`) |
| GET | `/api/monsters/mine` | sim | Monstrinho de quem está logado (`null` se não tiver) |
| POST | `/api/monsters` | sim | Cria um monstrinho: `{name?}` → `201 {monster}` |
| POST | `/api/monsters/join` | sim | Entra num monstrinho pelo código: `{code}` |
| GET | `/api/monsters/:id` | sim | Lê o monstrinho |
| PATCH | `/api/monsters/:id` | sim | Muda `name`, `frank_parts` e `frank_parts_updated_at` |
| DELETE | `/api/monsters/:id` | sim | Apaga o monstrinho para os dois cuidadores (`204`) |
| GET | `/api/monsters/:id/pairing` | sim | Pergunta atual, respostas e cuidadores |
| POST | `/api/monsters/:id/pairing/answers` | sim | Responde a pergunta: `{answer}` e avisa o outro cuidador |
| POST | `/api/monsters/:id/pairing/advance` | sim | Guarda a pergunta no diário e sorteia a próxima: `{expected_question?}` |
| GET | `/api/monsters/:id/pairing/history` | sim | Diário com as perguntas respondidas |
| POST | `/api/push-tokens` | sim | Registra o celular para notificações: `{token, platform}` (`204`) |
| DELETE | `/api/push-tokens/:token` | sim | Remove o celular das notificações (`204`) |

Exemplo com `curl`:

```bash
curl -X POST https://my-little-frank-api.onrender.com/api/auth/login -H "Content-Type: application/json" -d '{"email": "voce@email.com", "password": "sua-senha"}'
```

```bash
curl https://my-little-frank-api.onrender.com/api/monsters/mine -H "Authorization: Bearer COLE_O_TOKEN_AQUI"
```

## Como rodar nosso projeto localmente
### API
1. Instale as dependências da API:

   ```bash
   cd backend
   npm install
   ```

2. Copie `backend/.env.example` para `backend/.env` e preencha o `DATABASE_URL` (veja [Como pegar o DATABASE_URL](#como-pegar-o-database_url)).

3. Inicie a API. Ela fica em `http://localhost:3333`:

   ```bash
   npm run dev
   ```

### App
1. Na raiz do projeto, instale as dependências:

   ```bash
   npm install
   ```

2. Copie o arquivo `.env.example` para `.env`. Ele já aponta para a API no Render. Para usar a API rodando no seu computador, troque para `http://localhost:3333` (no navegador) ou `http://IP_DO_COMPUTADOR:3333` (no celular, na mesma rede Wi-Fi).

3. Inicie o aplicativo

   ```bash
   npx expo start
   ```

4. Abra o app: no celular, leia o QR Code com o app Expo Go; no computador, aperte `w` para abrir no navegador.

No Expo Go para Android as notificações push não funcionam. Para testar as notificações, use o APK.

## Testes da API
Os testes não precisam de banco instalado: eles criam um PostgreSQL em memória com o PGlite, aplicam as migrações da pasta `supabase/migrations/` e chamam as rotas por HTTP.

```bash
cd backend
npm test
```

## Como preparar o banco de dados
As tabelas ficam versionadas na pasta `supabase/migrations/`. Para criar ou atualizar as tabelas no projeto Supabase:

```bash
npx supabase login
```

```bash
npx supabase link --project-ref sowapejiwnjfqtmxxgam
```

```bash
npx supabase db push
```

A migração `api_no_render` cria a tabela `user_tokens` e tira todo o acesso da chave publicável do Supabase. Depois dela, só a API acessa os dados, e versões antigas do APK (que falavam direto com o Supabase) param de funcionar.

### Como pegar o DATABASE_URL
1. No [painel do Supabase](https://supabase.com/dashboard/project/sowapejiwnjfqtmxxgam), clique em **Connect**.
2. Escolha **Session pooler** e copie a URI. Ela tem o formato `postgresql://postgres.sowapejiwnjfqtmxxgam:[YOUR-PASSWORD]@aws-0-REGIAO.pooler.supabase.com:5432/postgres`.
3. Troque `[YOUR-PASSWORD]` pela senha do banco. Se ninguém lembrar a senha, crie uma nova em Project Settings > Database > Reset database password.

Use o **Session pooler**, não a conexão direta: a conexão direta do Supabase usa IPv6 por padrão, e o Render não sai por IPv6. A senha do banco é secreta: ela fica só no `backend/.env` e no Render, nunca no Git nem no app.

## Como publicar a API no Render
O arquivo `render.yaml` descreve o serviço. Para criar:

1. Entre em [render.com](https://render.com) com a conta do GitHub.
2. Clique em **New > Blueprint**, escolha o repositório `mylittlefrank` e a branch onde está o código.
3. O Render lê o `render.yaml` e pede os valores secretos:
   - `DATABASE_URL`: a URI do Session pooler (veja [Como pegar o DATABASE_URL](#como-pegar-o-database_url)).
   - `EXPO_ACCESS_TOKEN`: deixe vazio, a não ser que a segurança extra de push esteja ligada no Expo.
4. Confirme. O Render roda `npm ci --include=dev && npm run build` e depois `npm start`. Cada push na branch publica de novo.
5. Abra `https://my-little-frank-api.onrender.com/health`. A resposta deve ser `{"ok":true}`. Se o Render der outro endereço ao serviço, use esse endereço no `.env` do app.

Ao subir, a API confere se o banco responde e se a tabela `user_tokens` existe. Se faltar a migração, o log do Render mostra o comando para aplicá-la.

No plano gratuito, o Render desliga o serviço depois de uns 15 minutos sem uso. A primeira requisição depois disso pode levar até um minuto enquanto ele liga de novo; o app espera até 60 segundos.

## Como instalar o APK no celular Android
1. Envie o arquivo `.apk` para o celular e abra.
2. Se o Android pedir, permita a instalação de apps de fontes desconhecidas.
3. Se já existir uma versão do My Little Frank instalada que foi gerada em outro computador, desinstale-a antes.

O APK fala com a API no Render. Não é preciso deixar nenhum computador ligado.

## Como gerar o APK
As pastas `android/` e `ios/` são geradas pelo `expo prebuild` e não vão para o Git.

Pré-requisitos: Node.js, JDK 17 ou mais novo e o Android SDK (o jeito mais fácil é instalar o Android Studio). A variável `ANDROID_HOME` precisa apontar para o SDK.

1. Crie o `.env` como no passo 2 de [App](#app). O endereço da API fica embutido no APK.
2. Gere o projeto Android nativo:

   ```bash
   npx expo prebuild --platform android
   ```

3. Compile o APK (no Windows, use `gradlew.bat` no lugar de `./gradlew`):

   ```bash
   cd android
   ./gradlew assembleRelease -PreactNativeArchitectures=arm64-v8a,armeabi-v7a
   ```

4. O arquivo fica em `android/app/build/outputs/apk/release/app-release.apk`.

O APK é assinado com a chave de debug, o que basta para instalar nos próprios celulares. Para publicar na Play Store é preciso uma chave de release própria.

## Notificações push
Quando um cuidador responde a pergunta, a API manda a notificação "Seu parceiro respondeu!" para a API de push do Expo. Para elas chegarem no Android, o Firebase precisa estar configurado uma vez:

1. No [console do Firebase](https://console.firebase.google.com), em Configurações do projeto > Contas de serviço, clique em "Gerar nova chave privada".
2. Envie o JSON baixado em [expo.dev](https://expo.dev) > projeto `my-little-frank` > Credentials > Android > `com.mylittlefrank.app` > FCM V1 service account key. Essa chave é secreta: nunca faça commit dela.
