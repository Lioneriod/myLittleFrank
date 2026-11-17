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
- Supabase JS (`@supabase/supabase-js`), para ler e gravar os dados
- bcryptjs, para criptografar as senhas
- Expo Crypto, para gerar os números aleatórios da criptografia
- Expo Notifications, para as notificações push
- AsyncStorage, para guardar a sessão no celular

#### Back-end
- Supabase
- PostgreSQL

O código do back-end fica dentro do próprio app, na pasta `src/backend/`: cadastro, login, sessão, monstrinhos, perguntas, diário, notificações e exclusão de conta. O Supabase é usado só para guardar os dados no PostgreSQL.

### Como rodar nosso projeto localmente
1. Instale as dependências

   ```bash
   npm install
   ```

2. Copie o arquivo `.env.example` para `.env`. Ele já vem com o endereço e a chave do nosso projeto Supabase.

3. Inicie o aplicativo

   ```bash
   npx expo start
   ```

4. Abra o app: no celular, leia o QR Code com o app Expo Go; no computador, aperte `w` para abrir no navegador.

No Expo Go para Android as notificações push não funcionam. Para testar as notificações, use o APK.

### Como preparar o banco de dados (uma vez só)
As tabelas ficam versionadas na pasta `supabase/migrations/`. Para criar ou atualizar as tabelas no projeto Supabase:

```bash
npx supabase login
npx supabase link --project-ref sowapejiwnjfqtmxxgam
npx supabase db push --remote
```

A migração `supabase_so_com_dados` cria a tabela `users` e copia para ela as contas que já existiam, com as mesmas senhas.

### Como instalar o APK no celular Android
1. Envie o arquivo `.apk` para o celular e abra.
2. Se o Android pedir, permita a instalação de apps de fontes desconhecidas.
3. Se já existir uma versão do My Little Frank instalada que foi gerada em outro computador, desinstale-a antes.

O APK já fala direto com o Supabase. Não é preciso deixar nenhum computador ligado.

### Como gerar o APK
As pastas `android/` e `ios/` são geradas pelo `expo prebuild` e não vão para o Git.

Pré-requisitos: Node.js, JDK 17 ou mais novo e o Android SDK (o jeito mais fácil é instalar o Android Studio). A variável `ANDROID_HOME` precisa apontar para o SDK.

1. Crie o `.env` como no passo 2 de [Como rodar nosso projeto localmente](#como-rodar-nosso-projeto-localmente). O endereço e a chave do Supabase ficam embutidos no APK.
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

### Notificações push
O app manda a notificação "Seu parceiro respondeu!" direto para a API de push do Expo. Para elas chegarem no Android, o Firebase precisa estar configurado uma vez:

1. No [console do Firebase](https://console.firebase.google.com), em Configurações do projeto > Contas de serviço, clique em "Gerar nova chave privada".
2. Envie o JSON baixado em [expo.dev](https://expo.dev) > projeto `my-little-frank` > Credentials > Android > `com.mylittlefrank.app` > FCM V1 service account key. Essa chave é secreta: nunca faça commit dela.
