'use strict';

// Configuração do evento. Altere aqui equipas, critérios e regras de votação.
module.exports = {
  eventName: 'Hackathon',
  eventSubtitle: 'Votação das equipas',

  teams: [
    { id: 'fast-safe', name: 'Fast & Safe' },
    { id: 'hardening', name: 'Hardening' },
    { id: 'it-masters', name: 'IT Masters' },
    { id: 'amela', name: 'AMELA' },
    { id: 'ubuntusec', name: 'UBUNTUSEC' },
    { id: 'pseudocoders', name: 'The Pseudocoders' },
  ],

  // Cada critério é avaliado de scale.min a scale.max. "weight" permite dar mais peso a um critério.
  criteria: [
    {
      id: 'resolucao',
      title: 'Resolução do problema',
      description: 'A equipa resolveu o problema de forma eficiente e eficaz.',
      weight: 1,
    },
    {
      id: 'apresentacao',
      title: 'Apresentação',
      description: 'A equipa realizou a apresentação de resolução do seu problema de forma excelente.',
      weight: 1,
    },
    {
      id: 'inovacao',
      title: 'Inovação e criatividade',
      description: 'A solução é original e criativa, indo além das abordagens óbvias.',
      weight: 1,
    },
    {
      id: 'impacto',
      title: 'Impacto e aplicabilidade',
      description: 'A solução é viável, segura e pode ser aplicada num contexto real.',
      weight: 1,
    },
  ],

  scale: { min: 1, max: 10 },

  // Participantes não podem avaliar a própria equipa.
  blockOwnTeamVote: true,

  // Estado inicial (pode ser alterado depois na página de administração).
  votingOpenOnStart: true,
  resultsVisibleOnStart: true,
};
