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
- Supabase (Auth, PostgreSQL com RLS, Edge Functions em Deno/TypeScript)
- PostgreSQL
- Expo Push API (notificações)
### Como rodar nosso projeto localmente
1. Instale as dependências

   ```bash
   npm install
   ```

2. Copie o arquivo `.env.example` para `.env` e preencha com a URL e a chave publicável do seu projeto Supabase (veja [Variáveis de ambiente e segredos](#variáveis-de-ambiente-e-segredos)).

3. Inicie o aplicativo

   ```bash
   npx expo start
   ```

### Como gerar o APK para instalar no celular Android
O APK é compilado a partir do código. As pastas `android/` e `ios/` são geradas pelo `expo prebuild` e não vão para o Git.

Pré-requisitos: Node.js, JDK 17 ou mais novo e o Android SDK (o jeito mais fácil é instalar o Android Studio). A variável `ANDROID_HOME` precisa apontar para o SDK.

1. Crie o `.env` como no passo 2 acima. A URL e a chave do Supabase ficam embutidas no APK: sem elas, o app fecha assim que abre.
2. Gere o projeto Android nativo:

   ```bash
   npx expo prebuild --platform android
   ```

3. Compile o APK de release (no Windows, use `gradlew.bat` no lugar de `./gradlew`):

   ```bash
   cd android
   ./gradlew assembleRelease
   ```

   Para compilar mais rápido, gere só para celulares de 64 bits: `./gradlew assembleRelease -PreactNativeArchitectures=arm64-v8a`.
4. O arquivo fica em `android/app/build/outputs/apk/release/app-release.apk`. Envie para o celular, abra e permita a instalação de apps de fontes desconhecidas.

O APK é assinado com a chave de debug, o que basta para instalar nos próprios celulares. Um APK gerado em outro computador tem outra assinatura: desinstale a versão anterior antes de instalar a nova. Para publicar na Play Store é preciso uma chave de release própria.

As notificações push ficam desligadas nesse APK enquanto o `app.json` não tiver um `extra.eas.projectId` e o Firebase Cloud Messaging não estiver configurado (veja [Notificações push](#notificações-push)).

## Back-end

Todo o back-end roda no [Supabase](https://supabase.com) e está versionado neste repositório, na pasta `supabase/`. As migrações são a fonte da verdade do banco: nada deve ser alterado direto no dashboard sem virar uma migração.

```
supabase/
├── config.toml          configuração do Supabase CLI e das Edge Functions
├── migrations/          esquema do banco, aplicado em ordem
└── functions/
    ├── _shared/         código comum (CORS, erros em JSON, cliente service_role, checagem do JWT)
    ├── delete-account/
    └── notify-partner/
```

O Supabase CLI é uma dependência de desenvolvimento do projeto, então use sempre `npx supabase ...`. Na versão 3 do CLI, `db push` e `db pull` usam o banco local por padrão: para o projeto na nuvem é preciso passar `--remote`.

### Arquitetura

```
App Expo (supabase-js + chave publicável)
 ├─► Supabase Auth ............ login com e-mail e senha
 ├─► Tabelas (PostgREST) ...... leitura e algumas colunas liberadas, sempre com RLS
 ├─► Funções SQL (rpc) ........ ações com regras (criar/entrar no monstrinho, responder, avançar pergunta)
 └─► Edge Functions ........... delete-account, notify-partner
        ├─► banco e Auth admin com a chave service_role (só no servidor)
        └─► API de push do Expo
```

- O app só tem a chave publicável (ou a `anon` legada). A chave `service_role` existe apenas dentro das Edge Functions.
- Todas as tabelas têm RLS ligado. O papel `anon` (usuário sem login) não tem acesso a nenhuma tabela nem a nenhuma função.
- Ações que mexem em mais de uma tabela ou que precisam de regras extras são funções SQL `security definer`, chamadas com `supabase.rpc(...)`. Elas sempre verificam `auth.uid()` e se o usuário é cuidador do monstrinho.
- O que precisa da chave `service_role` ou de serviços externos fica nas Edge Functions.

### Tabelas

| Tabela | Para que serve | O que o app (`authenticated`) pode fazer |
|---|---|---|
| `monsters` | O monstrinho: `name`, `invite_code`, `frank_parts` (JSON com as partes do Frank), `frank_parts_updated_at`, `created_by` e `created_at`. | Ler o monstrinho de que cuida. Alterar só `name`, `frank_parts` e `frank_parts_updated_at`. |
| `monster_members` | Quem cuida de cada monstrinho (no máximo 2). Cada usuário cuida de um só. | Ler os cuidadores do próprio monstrinho. |
| `monster_pairing` | A pergunta atual de cada monstrinho e as respostas (`answers`, no formato `{ "id do usuário": "resposta" }`). | Ler. A escrita acontece só pelas funções SQL. |
| `monster_pairing_history` | O diário: perguntas que todos já responderam, com as respostas e a data (`answered_at`). | Ler o diário do próprio monstrinho. |
| `pairing_questions` | O banco de perguntas (`question`, `active`). As perguntas iniciais são inseridas por migração. | Nada (só as funções SQL leem). |
| `push_tokens` | Tokens de push do Expo de cada aparelho (`token`, `user_id`, `platform`, `updated_at`). | Nada direto; usa `register_push_token` e `unregister_push_token`. |

Apagar um usuário apaga em cascata os monstrinhos criados por ele, a participação dele e os tokens de push. Apagar um monstrinho apaga os cuidadores, a pergunta atual e o diário.

Para adicionar perguntas, crie uma migração com `insert into public.pairing_questions (question) values ('Nova pergunta?');`. Para tirar uma pergunta de uso sem perder o histórico, use `update public.pairing_questions set active = false where question = '...';`.

### Funções SQL

| Função | O que faz | Quem pode chamar |
|---|---|---|
| `create_monster(monster_name)` | Cria o monstrinho do usuário com um código de convite e o coloca como primeiro cuidador. | `authenticated` |
| `join_monster(code)` | Entra como segundo cuidador usando o código de convite. | `authenticated` |
| `ensure_pairing_question(monster_uuid)` | Cria a primeira pergunta do monstrinho, se ainda não existir. | cuidador |
| `answer_pairing_question(monster_uuid, answer_text)` | Salva a resposta do usuário na pergunta atual. | cuidador |
| `archive_and_reset_pairing(monster_uuid)` | Depois que todos os cuidadores responderam, guarda a pergunta e as respostas no diário e escolhe a próxima pergunta no servidor (nunca repete a atual e dá preferência às que o monstrinho ainda não respondeu). Se alguém ainda não respondeu, falha com `not_all_answered`. | cuidador |
| `delete_monster(monster_uuid)` | Apaga o monstrinho para todos os cuidadores. | cuidador |
| `leave_monster(monster_uuid)` | Sai do monstrinho e o apaga se ninguém sobrar. Hoje o app não usa. | cuidador |
| `monster_exists(m)` | Diz se o monstrinho ainda existe (o app confere depois de apagar). | `authenticated` |
| `register_push_token(push_token, device_platform)` | Salva o token de push do aparelho para o usuário logado. Se o aparelho trocar de conta, o token passa para a conta nova. | `authenticated` |
| `unregister_push_token(push_token)` | Remove o token do usuário logado (usado ao sair da conta). | `authenticated` |
| `is_monster_member(target_monster)` | Diz se o usuário logado cuida do monstrinho. Usada pelas políticas de RLS. | `authenticated` |
| `pick_pairing_question(monster_uuid, exclude_question)` | Escolhe a próxima pergunta. | interna |
| `generate_invite_code()` | Gera um código de 6 caracteres sem 0/O e 1/I. | interna |

Os erros das funções novas vêm como códigos (`not_authenticated`, `not_a_member`, `not_all_answered`, `no_questions`, `invalid_code`, `monster_full`, `already_has_monster`...). O app traduz esses códigos para português em `friendlyError` (`src/lib/supabase.ts`).

### Edge Functions

Todas as funções aceitam só `POST` (e `OPTIONS`, para CORS na versão web), respondem JSON e, em caso de erro, devolvem `{ "error": "codigo", "message": "mensagem em português" }` com o status HTTP adequado. Segredos são lidos só de variáveis de ambiente.

No `config.toml` as funções estão com `verify_jwt = false`: em vez do gateway, cada função confere o JWT do usuário chamando o Supabase Auth (`auth.getUser`), o que funciona tanto com as chaves novas (publishable/secret) quanto com as legadas. O app chama as funções com `invokeFunction` (`src/lib/supabase.ts`), que já envia o token da sessão.

**`delete-account`**
- Autenticação: JWT do usuário.
- Corpo: nenhum.
- O que faz: se o usuário criou um monstrinho, apaga esse monstrinho (cuidadores, pergunta e diário vão junto). Se não criou, apenas remove a participação dele. Depois apaga o usuário com `auth.admin.deleteUser`.
- Resposta: `{ "ok": true, "deleted_monster": true | false }`.
- Usada em: Perfil > Apagar conta.

**`notify-partner`**
- Autenticação: JWT do usuário.
- Corpo: `{ "monster_id": "uuid do monstrinho" }`.
- O que faz: confere se o usuário cuida do monstrinho e se já respondeu a pergunta atual, busca os tokens do outro cuidador e envia "Seu parceiro respondeu!" pela API de push do Expo. Tokens que o Expo diz não existirem mais (`DeviceNotRegistered`) são apagados.
- Resposta: `{ "ok": true, "sent": 1, "removed_tokens": 0 }`.
- Usada em: logo depois de `answer_pairing_question`, na tela inicial.

### Notificações push

- O app registra o token do Expo depois do login (`src/lib/pushNotifications.ts`) e remove o token ao sair da conta.
- O registro só acontece em celular (não na web), fora do Expo Go no Android (desde o SDK 53 o Expo Go não recebe push remoto no Android) e quando o `app.json` tem um `extra.eas.projectId`.
- No Android, o Expo entrega os pushes pelo Firebase Cloud Messaging (FCM), então o app precisa do `google-services.json` e o Expo precisa da chave do FCM.

Para ativar no Android (uma vez só):

1. **Projeto no Expo.** Crie uma conta em [expo.dev](https://expo.dev) e, na raiz do repositório, rode `npx eas-cli login` e depois `npx eas-cli init`. O comando grava `extra.eas.projectId` e `owner` no `app.json`; faça commit dessa mudança.
2. **App no Firebase.** No [console do Firebase](https://console.firebase.google.com), crie um projeto e adicione um app Android com o pacote `com.mylittlefrank.app`. Baixe o `google-services.json`, coloque na raiz do repositório e adicione `"googleServicesFile": "./google-services.json"` dentro de `expo.android` no `app.json`. Esse arquivo pode ir para o Git: ele só identifica o app e já vai dentro do APK.
3. **Chave do FCM no Expo.** No Firebase, em Configurações do projeto > Contas de serviço, clique em "Gerar nova chave privada". Envie o JSON baixado em expo.dev > seu projeto > Credentials > Android > `com.mylittlefrank.app` > FCM V1 service account key. Essa chave é secreta: nunca faça commit dela.
4. **Back-end.** A tabela `push_tokens`, as funções `register_push_token`/`unregister_push_token` e a Edge Function `notify-partner` precisam estar no projeto Supabase:

   ```bash
   npx supabase link --project-ref SEU_PROJECT_REF
   npx supabase db push --remote
   npx supabase functions deploy --use-api
   ```

5. **Novo APK.** Gere o APK de novo (veja [Como gerar o APK](#como-gerar-o-apk-para-instalar-no-celular-android)) e instale nos celulares.

Para testar, entre com duas contas que cuidam do mesmo monstrinho, uma em cada celular, e responda a pergunta do corvo em um deles: o outro recebe "Seu parceiro respondeu!". No iOS, o push precisa de uma conta paga da Apple e de um build pelo EAS.

### Variáveis de ambiente e segredos

**App** (arquivo `.env` na raiz, baseado no `.env.example`, nunca versionado):

| Variável | Onde encontrar |
|---|---|
| `EXPO_PUBLIC_SUPABASE_URL` | Dashboard > Project Settings > Data API > Project URL |
| `EXPO_PUBLIC_SUPABASE_KEY` | Dashboard > Project Settings > API Keys > "Publishable key" (ou a chave "anon" legada) |

Nunca coloque a chave `service_role` (ou a "secret key") no app.

**Edge Functions:**

| Segredo | Descrição |
|---|---|
| `SUPABASE_URL`, `SUPABASE_ANON_KEY`, `SUPABASE_SERVICE_ROLE_KEY` | Criados automaticamente pelo Supabase. |
| `EXPO_ACCESS_TOKEN` | Opcional. Só é necessário se o "Enhanced push security" estiver ligado na conta do Expo. |

### Como configurar um novo projeto Supabase a partir do repositório

Pré-requisitos: Node.js, `npm install` já rodado e Docker Desktop aberto (o CLI usa Docker para empacotar as Edge Functions, a não ser que você use `--use-api`).

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

4. Publique as Edge Functions (sem nome, publica todas):

   ```bash
   npx supabase functions deploy
   ```

5. Configure o `.env` do app (veja [Variáveis de ambiente e segredos](#variáveis-de-ambiente-e-segredos)) e rode `npx expo start`.

As configurações de Auth (confirmação de e-mail, provedores, URLs de redirecionamento) continuam no dashboard. A seção `[auth]` do `config.toml` vale só para o ambiente local.

### Mudando o back-end

- Mudança no banco: `npx supabase migration new nome_da_mudanca`, escreva o SQL no arquivo criado em `supabase/migrations/` e aplique com `npx supabase db push --remote`.
- No Supabase, funções novas no schema `public` ganham `EXECUTE` para `anon` por padrão, e tabelas novas ganham todos os privilégios para `anon` e `authenticated`. Em toda migração, revogue o que não deve ser público (`revoke execute on function ... from public, anon;`, `revoke all on ... from anon;`) e ligue o RLS das tabelas novas.
- Se alguém alterar o banco pelo dashboard, traga a mudança para o repositório com `npx supabase db pull --remote`.
- Mudança numa Edge Function: `npx supabase functions deploy nome-da-funcao`.
- Para rodar tudo localmente (precisa de Docker): `npx supabase start` e `npx supabase functions serve`.
