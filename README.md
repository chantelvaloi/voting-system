# Votação do Hackathon

Sistema de votação simples, com resultados em tempo real. Corre com Node.js 20 ou mais recente. Localmente guarda os dados num ficheiro JSON; online usa Postgres.

## Arranque rápido

```bash
npm install
npm run gerar-codigos            # cria data/voters.csv (1 admin, 6 equipas × 5 membros, 6 visitantes)
npm start                        # http://localhost:3000
```

Opções do gerador: `--membros 5 --visitantes 10 --admins 2 --force` (`--force` substitui o ficheiro existente).

Para os votantes acederem pela rede do evento, partilhe o endereço IP da máquina, por exemplo `http://192.168.1.20:3000`. Para usar outra porta: `PORT=8080 npm start`.

## Páginas

| Página | Para quem | O que faz |
|---|---|---|
| `/` | Todos | Login com o código pessoal |
| `/votar` | Participantes e visitantes | Notas de 1 a 10 em cada critério, uma equipa de cada vez |
| `/resultados` | Público (pode ser projetado) | Classificação e participação em tempo real |
| `/admin` | Administradores | Abrir ou fechar a votação, ocultar os resultados, ver quem já votou, exportar CSV, imprimir os cartões com os códigos |

## Votantes (`data/voters.csv`)

Colunas: `codigo,nome,equipa,tipo`. Pode editar o ficheiro no Excel, com vírgula ou ponto e vírgula como separador.

- `tipo`: `participante`, `visitante` ou `admin`
- `equipa`: o nome da equipa (ex.: `IT Masters`). Fica vazio para visitantes e administradores.

O servidor lê as alterações automaticamente, sem ser preciso reiniciá-lo. Se remover um código, os votos desse código deixam de contar.

## Regras e configuração (`config.js`)

- Equipas, critérios, descrições, escala e pesos de cada critério.
- `blockOwnTeamVote`: os participantes não avaliam a própria equipa (ligado por omissão).
- Nota final de cada equipa: a média (ponderada pelos pesos) das médias de cada critério. Em caso de empate, ganha quem tiver melhor nota no 1.º critério, depois no 2.º, e assim por diante.
- Cada votante pode alterar as suas avaliações enquanto a votação estiver aberta.

## Dados

- **Localmente:** votos, sessões e o estado da votação ficam em `data/db.json`. Para recomeçar do zero, pare o servidor e apague esse ficheiro.
- **Online:** com `DATABASE_URL` definido, tudo fica na tabela `app_state` do Postgres. Para recomeçar do zero, corra `DELETE FROM app_state;` e reinicie o serviço.

## Publicar online (Render, grátis)

O ficheiro `render.yaml` cria um serviço web e uma base de dados Postgres na região de Frankfurt.

O ficheiro `data/voters.csv` **não vai para o GitHub**, porque o repositório é público. Fica guardado no Render como Secret File.

1. Faça push deste projeto para o GitHub.
2. No Render, abra **New → Blueprint**, escolha o repositório e carregue em **Apply**.
3. No serviço `hackathon-votacao`, abra **Environment → Secret Files → Add Secret File**. Use o nome `voters.csv`, cole o conteúdo de `data/voters.csv` e guarde.
4. Carregue em **Manual Deploy → Deploy latest commit**. Nos logs deve aparecer `[voters.csv] 37 códigos carregados` e `[postgres] ligado`.
5. O site fica disponível em `https://hackathon-votacao.onrender.com` (ou num endereço parecido).

Para mudar os votantes, edite o Secret File no Render e volte a fazer deploy. Os votos ficam guardados no Postgres.

Limitações do plano grátis:
- O serviço adormece ao fim de 15 minutos sem visitas. O primeiro acesso depois disso demora cerca de 1 minuto. Abra o site uns minutos antes do evento.
- A base de dados grátis expira 30 dias depois de ser criada. Exporte os votos (CSV) na página de administração no fim do evento.

Variáveis de ambiente: `DATABASE_URL` (Postgres), `VOTERS_FILE` (caminho do CSV de votantes), `TRUST_PROXY=1` (IP real atrás do proxy, para o limite de tentativas de login), `SECURE_COOKIE=1` (cookie apenas por HTTPS) e `PORT`.
