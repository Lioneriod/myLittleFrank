# My Little Frank
## Sobre o MLF (My Little Frank)
### Por que criamos este aplicativo
Este é um aplicativo de "cuidados com um animal de estimação virtual", misturado com o fortalecimento do vínculo entre pais e filhos. A ideia principal é que os usuários compartilhem um animal de estimação e, por meio das interações com ele, conheçam mais um ao outro e interajam entre si.
Criamos esse app como suporte para famílias que não podem estar juntas o tempo todo, facilitando interações rápidas enquanto trabalham ou estão ausentes. Não é algo que substitua a forma como se relacionam, mas sim uma ferramenta de apoio à relação deles.

### Por que o aplicativo se chama My Little Frank?
Ambos os desenvolvedores deste projeto são grandes fãs de horror, Halloween e terror. E, como somos mais motivados quando estamos nos divertindo, decidimos usar esses temas em nosso projeto.
Este aplicativo foi criado para que os usuários cuidem de um pequeno "monstro de Frankenstein", que pode ser personalizado usando agulha, linha e várias partes monstruosas do corpo!

### Informações técnicas
Este é um projeto [Expo](https://expo.dev). Utilizamos o projeto [Helia](https://github.com/Rodrigo322/helia-youtube), desenvolvido por [Rodrigo322](https://github.com/Rodrigo322), como base e referência inicial.
#### Front-end
- Expo
- React Native
- React Navigation
- TypeScript
- Jest
- React Native Reanimated
#### Back-end

O back-end é uma API em Node.js que roda no seu computador e fica na pasta `backend/`. O Supabase é usado só para guardar os dados: as tabelas do PostgreSQL e as contas do Supabase Auth. Nenhuma regra do app roda no Supabase (não há Edge Functions nem funções SQL) e o app nunca fala direto com ele.

```
backend/
├── .env.example         modelo do arquivo .env
└── src/
    ├── server.ts        confere a conexão com o Supabase e sobe o servidor
    ├── app.ts           monta o Express: CORS, log, rotas e tratamento de erros
    ├── env.ts           lê o .env
    ├── supabase.ts      clientes do Supabase (chave secreta e chave publicável)
    ├── auth.ts          confere o token de quem chama (requireUser)
    ├── errors.ts        códigos de erro e mensagens em português
    ├── validation.ts    validação do corpo e dos parâmetros
    ├── locks.ts         fila por monstrinho e por usuário
    ├── routes/          uma rota por arquivo: auth, account, monsters, pushTokens
    └── services/        as regras: monsters, pairing, push, account
supabase/
├── config.toml          configuração do Supabase CLI
└── migrations/          esquema do banco, aplicado em ordem
```

### Arquitetura

```
App Expo (src/lib/api.ts)
 └─► API Node/Express no seu computador (porta 3333)
        ├─► Supabase Auth ...... criar conta, entrar, renovar e conferir o token, apagar usuário
        ├─► Supabase Postgres .. leitura e escrita nas tabelas com a chave secreta
        └─► API de push do Expo
```

- O app só conhece o endereço da API (`EXPO_PUBLIC_API_URL`). Ele não tem nenhuma chave do Supabase.
- As chaves do Supabase ficam no `backend/.env`. A chave secreta só existe no back-end.
- Todas as tabelas têm RLS ligado e nenhuma política: os papéis `anon` e `authenticated` não leem nem escrevem nada. Só a chave secreta do back-end acessa os dados.
- As regras (quem pode fazer o quê, limite de dois cuidadores, escolha da pergunta, envio do push) ficam em `backend/src/services/`.

### Login e sessão

1. O app envia e-mail e senha para `POST /auth/login` (ou `/auth/signup`). O back-end repassa para o Supabase Auth e devolve a sessão: `access_token`, `refresh_token`, `expires_at` e `user` (`id` e `email`).
2. O app guarda a sessão no AsyncStorage (`src/lib/api.ts`) e envia `Authorization: Bearer <access_token>` em toda chamada.
3. Em cada rota protegida, o back-end confere o token com o Supabase Auth (`requireUser`) e descobre quem é o usuário.
4. Quando o token está para vencer, ou a API responde 401, o app chama `POST /auth/refresh` com o `refresh_token` e repete a chamada. Se a renovação for recusada, o app apaga a sessão e volta para a tela de login.

### Rotas

Todas respondem JSON. Fora `/health` e as três primeiras de `/auth`, todas exigem o cabeçalho `Authorization: Bearer <access_token>`.

| Rota | Corpo | O que faz |
|---|---|---|
| `GET /health` | | Diz se a API está no ar. |
| `POST /auth/signup` | `{ email, password }` | Cria a conta. Responde `{ session, confirmation_required }`; a sessão vem `null` quando o projeto exige confirmar o e-mail. |
| `POST /auth/login` | `{ email, password }` | Entra na conta. Responde `{ session }`. |
| `POST /auth/refresh` | `{ refresh_token }` | Troca o `refresh_token` por uma sessão nova. |
| `POST /auth/logout` | | Encerra as sessões do usuário no Supabase Auth. |
| `DELETE /account` | | Apaga a conta. Se o usuário criou um monstrinho, apaga o monstrinho (cuidadores, pergunta e diário vão junto); se não criou, só remove a participação dele. Responde `{ ok, deleted_monster }`. |
| `GET /monsters/mine` | | Devolve o monstrinho do usuário: `{ monster }` ou `{ monster: null }`. |
| `POST /monsters` | `{ name? }` | Cria o monstrinho com um código de convite de 6 caracteres (sem 0/O e 1/I) e coloca o usuário como primeiro cuidador. |
| `POST /monsters/join` | `{ code }` | Entra como segundo cuidador usando o código de convite. |
| `GET /monsters/:id` | | Devolve o monstrinho, com as partes do Frank. |
| `PATCH /monsters/:id` | `{ name?, frank_parts?, frank_parts_updated_at? }` | Muda o nome (1 a 30 caracteres) ou as partes do Frank. |
| `DELETE /monsters/:id` | | Apaga o monstrinho para todos os cuidadores. |
| `POST /monsters/:id/leave` | | Sai do monstrinho e o apaga se ninguém sobrar. Hoje o app não usa. |
| `GET /monsters/:id/pairing` | | Devolve a pergunta atual: `{ pairing: { question, answers, members } }`. Cria a primeira pergunta se ainda não existir. |
| `POST /monsters/:id/pairing/answer` | `{ answer }` | Salva a resposta do usuário e envia o push "Seu parceiro respondeu!" para o outro cuidador. |
| `POST /monsters/:id/pairing/advance` | `{ question? }` | Depois que todos responderam, guarda a pergunta e as respostas no diário e escolhe a próxima (nunca repete a atual e dá preferência às que o monstrinho ainda não respondeu). |
| `GET /monsters/:id/history` | | Devolve o diário, da resposta mais nova para a mais antiga. |
| `PUT /push-tokens` | `{ token, platform }` | Salva o token de push do aparelho para o usuário. Se o aparelho trocar de conta, o token passa para a conta nova. |
| `DELETE /push-tokens/:token` | | Remove o token do usuário (usado ao sair da conta). |

As rotas com `:id` só funcionam para quem cuida daquele monstrinho; para os outros a resposta é 403 `not_a_member`.

Em caso de erro, a resposta é `{ "error": "codigo", "message": "mensagem em português" }` com o status HTTP adequado. Os códigos e as mensagens ficam em `backend/src/errors.ts` (`invalid_credentials`, `user_already_exists`, `not_authenticated`, `not_a_member`, `invalid_code`, `monster_full`, `already_has_monster`, `not_all_answered`...). O app mostra a `message` que recebe.

### Tabelas

O back-end é o único que lê e escreve nas tabelas.

| Tabela | Para que serve |
|---|---|
| `monsters` | O monstrinho: `name`, `invite_code`, `frank_parts` (JSON com as partes do Frank), `frank_parts_updated_at`, `created_by` e `created_at`. |
| `monster_members` | Quem cuida de cada monstrinho (no máximo 2). Cada usuário cuida de um só. |
| `monster_pairing` | A pergunta atual de cada monstrinho e as respostas (`answers`, no formato `{ "id do usuário": "resposta" }`). |
| `monster_pairing_history` | O diário: perguntas que todos já responderam, com as respostas e a data (`answered_at`). |
| `pairing_questions` | O banco de perguntas (`question`, `active`). As perguntas iniciais são inseridas por migração. |
| `push_tokens` | Tokens de push do Expo de cada aparelho (`token`, `user_id`, `platform`, `updated_at`). |

As contas (e-mail e senha) ficam no Supabase Auth. Apagar um usuário apaga em cascata os monstrinhos criados por ele, a participação dele e os tokens de push. Apagar um monstrinho apaga os cuidadores, a pergunta atual e o diário.

Para adicionar perguntas, crie uma migração com `insert into public.pairing_questions (question) values ('Nova pergunta?');`. Para tirar uma pergunta de uso sem perder o histórico, use `update public.pairing_questions set active = false where question = '...';`.

### Ações ao mesmo tempo

O Supabase é acessado pela API REST, que não tem transações. Para duas ações simultâneas não se atropelarem (os dois cuidadores respondendo juntos, duas pessoas usando o mesmo código de convite), o back-end coloca em fila as ações do mesmo monstrinho e do mesmo usuário (`backend/src/locks.ts`). A fila vive na memória do processo, então rode uma única instância do back-end por banco.

### Notificações push

- O app registra o token do Expo depois do login (`src/lib/pushNotifications.ts`) e remove o token ao sair da conta.
- O registro só acontece em celular (não na web), fora do Expo Go no Android (desde o SDK 53 o Expo Go não recebe push remoto no Android) e quando o `app.json` tem um `extra.eas.projectId`.
- No Android, o Expo entrega os pushes pelo Firebase Cloud Messaging (FCM), então o app precisa do `google-services.json` e o Expo precisa da chave do FCM.
- Quem envia o push é o back-end, logo depois de salvar uma resposta. Tokens que o Expo diz não existirem mais (`DeviceNotRegistered`) são apagados.

Para ativar no Android (uma vez só):

1. **Projeto no Expo.** Crie uma conta em [expo.dev](https://expo.dev) e, na raiz do repositório, rode `npx eas-cli login` e depois `npx eas-cli init`. O comando grava `extra.eas.projectId` e `owner` no `app.json`; faça commit dessa mudança.
2. **App no Firebase.** No [console do Firebase](https://console.firebase.google.com), crie um projeto e adicione um app Android com o pacote `com.mylittlefrank.app`. Baixe o `google-services.json`, coloque na raiz do repositório e adicione `"googleServicesFile": "./google-services.json"` dentro de `expo.android` no `app.json`. Esse arquivo pode ir para o Git: ele só identifica o app e já vai dentro do APK.
3. **Chave do FCM no Expo.** No Firebase, em Configurações do projeto > Contas de serviço, clique em "Gerar nova chave privada". Envie o JSON baixado em expo.dev > seu projeto > Credentials > Android > `com.mylittlefrank.app` > FCM V1 service account key. Essa chave é secreta: nunca faça commit dela.
4. **Back-end.** Deixe o back-end rodando no computador (`npm run backend`).
5. **Novo APK.** Gere o APK de novo (veja [Como gerar o APK](#como-gerar-o-apk-para-instalar-no-celular-android)) e instale nos celulares.

Para testar, entre com duas contas que cuidam do mesmo monstrinho, uma em cada celular, e responda a pergunta do corvo em um deles: o outro recebe "Seu parceiro respondeu!". No iOS, o push precisa de uma conta paga da Apple e de um build pelo EAS.

### Variáveis de ambiente e segredos

**App** (arquivo `.env` na raiz, baseado no `.env.example`, nunca versionado):

| Variável | Valor |
|---|---|
| `EXPO_PUBLIC_API_URL` | Endereço do back-end, por exemplo `http://192.168.0.10:3333`. |

**Back-end** (arquivo `backend/.env`, baseado no `backend/.env.example`, nunca versionado):

| Variável | Onde encontrar |
|---|---|
| `PORT` | Porta da API. O padrão é `3333`. |
| `SUPABASE_URL` | Dashboard > Project Settings > Data API > Project URL |
| `SUPABASE_PUBLISHABLE_KEY` | Dashboard > Project Settings > API Keys > "Publishable key" (ou a chave "anon" legada). Usada para criar conta, entrar e renovar a sessão. |
| `SUPABASE_SECRET_KEY` | Dashboard > Project Settings > API Keys > "Secret key" (ou a chave "service_role" legada). Usada para ler e escrever nas tabelas e apagar usuários. |
| `EXPO_ACCESS_TOKEN` | Opcional. Só é necessário se o "Enhanced push security" estiver ligado na conta do Expo. |

A chave secreta dá acesso total ao banco: nunca faça commit dela nem a coloque no app.

### Como configurar um novo projeto Supabase a partir do repositório

O Supabase CLI é uma dependência de desenvolvimento do projeto, então use sempre `npx supabase ...`. Na versão 3 do CLI, `db push` e `db pull` usam o banco local por padrão: para o projeto na nuvem é preciso passar `--remote`.

1. Crie o projeto no dashboard do Supabase e anote o *project ref* (o `xxxx` de `https://xxxx.supabase.co`) e a senha do banco.

2. Entre no CLI e vincule o repositório ao projeto:

   ```bash
   npx supabase login
   npx supabase link --project-ref SEU_PROJECT_REF
   ```

3. Crie o banco aplicando todas as migrações. O `--dry-run` mostra antes o que vai ser aplicado:

   ```bash
   npx supabase db push --remote --dry-run
   npx supabase db push --remote
   ```

4. Preencha o `backend/.env` com a URL e as chaves do projeto e siga [Como rodar nosso projeto localmente](#como-rodar-nosso-projeto-localmente).

As configurações de Auth (confirmação de e-mail, provedores, URLs de redirecionamento) continuam no dashboard.

Se o projeto ainda tiver as Edge Functions antigas publicadas, apague-as, porque o back-end em Node faz o trabalho delas:

```bash
npx supabase functions delete delete-account
npx supabase functions delete notify-partner
```

### Mudando o back-end

- Regra ou rota nova: crie ou altere o serviço em `backend/src/services/` e a rota em `backend/src/routes/`. Com `npm run backend` o servidor reinicia sozinho a cada mudança. Confira os tipos com `npm run typecheck --prefix backend`.
- No app, toda chamada ao back-end passa por `src/lib/api.ts`.
- Mudança no banco: `npx supabase migration new nome_da_mudanca`, escreva o SQL no arquivo criado em `supabase/migrations/` e aplique com `npx supabase db push --remote`. As migrações são a fonte da verdade do banco: nada deve ser alterado direto no dashboard sem virar uma migração.
- Em toda tabela nova, ligue o RLS, tire o acesso dos papéis do app (`revoke all on ... from anon, authenticated;`) e libere para o back-end (`grant select, insert, update, delete on ... to service_role;`).
- Se alguém alterar o banco pelo dashboard, traga a mudança para o repositório com `npx supabase db pull --remote`.
- Para testar sem mexer no banco da nuvem (precisa de Docker): `npx supabase start` sobe um Supabase local com as migrações aplicadas e `npx supabase status` mostra a URL e as chaves para colocar no `backend/.env`.
