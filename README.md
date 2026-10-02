# Votação do Hackathon

Sistema de votação simples, com resultados em tempo real. Não precisa de base de dados nem de `npm install`: só Node.js 18 ou mais recente.

## Arranque rápido

```bash
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

Votos, sessões e estado da votação ficam em `data/db.json`. Para recomeçar do zero, pare o servidor e apague esse ficheiro.

Se publicar o sistema atrás de HTTPS, arranque com `SECURE_COOKIE=1 npm start`.
