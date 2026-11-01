import assert from 'node:assert/strict';
import { test } from 'node:test';
import { detectarRelatoAfirmativo, detectarUrgencia } from './urgencia';

test('fictional service terms detect Portuguese and English reports without assigning clinical priority', () => {
  for (const report of [
    'Estou com muita falta de ar agora.',
    'Estou com febre.',
    'Sinto dor no peito.',
    'Não consigo respirar.',
    'Há sangue na urina.',
    'I have a fever now.',
    'I am short of breath.',
    "I can't breathe.",
    'Sem febre, mas estou com falta de ar.',
    'Não tenho febre, mas estou com dor no peito.',
  ]) {
    const found = detectarUrgencia(report);
    assert.ok(found, report);
    assert.deepEqual(Object.keys(found), ['termo']);
  }
});

test('simple Portuguese and English negations do not create a textual hypothesis', () => {
  for (const report of [
    'Estou sem febre.',
    'Não tenho falta de ar.',
    'Não sinto dor no peito.',
    'Não estou com febre.',
    'Não estou sentindo dor forte.',
    'Não tenho mais falta de ar.',
    'Não tenho febre nem falta de ar.',
    'No fever.',
    "I don't have a fever.",
    "I'm not short of breath.",
    'Without severe pain.',
    'Feverishness is not a whole-word match.',
  ]) assert.equal(detectarUrgencia(report), undefined, report);
});

test('current self reports after independent clauses are not suppressed by earlier question, history or another person', () => {
  for (const report of [
    'O que fazer se tiver febre? Estou vomitando agora.',
    'Tive febre ontem, hoje estou vomitando.',
    'Ontem eu estava com febre. Hoje estou vomitando.',
    'Não tenho febre mas estou vomitando.',
    'Não tenho febre e estou vomitando.',
    'Tive febre ontem e hoje estou vomitando.',
    'Minha mãe está com febre, eu estou vomitando.',
    'What should I do if I get fever? I am vomiting now.',
    'I had a fever yesterday, and now I am vomiting.',
    'My mother has a fever and I am vomiting now.',
    'Não estou vomitando, mas agora estou com febre.',
    'Não tenho febre. Não consigo parar de vomitar.',
  ]) assert.ok(detectarRelatoAfirmativo(report), report);
});

test('clause boundaries preserve hypothetical questions, simple denial, historical and third party controls', () => {
  for (const report of [
    'O que fazer se tiver febre?',
    'Se eu tiver febre e eu estiver vomitando, o que devo fazer?',
    'If I have a fever and I am vomiting, what should I do?',
    'Febre?',
    'Vômitos?',
    'Tive febre ontem, hoje estou bem.',
    'My mother had a fever yesterday, and she is vomiting now.',
    'Não tenho febre e não estou vomitando.',
    'I do not have a fever and I am not vomiting.',
    'Estou sem febre, sem vômitos.',
  ]) assert.equal(detectarRelatoAfirmativo(report), undefined, report);
});
