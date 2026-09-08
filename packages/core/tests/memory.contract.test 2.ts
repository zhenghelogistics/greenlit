import { createMemoryRepository } from '../src/memory.ts';
import { runRepositoryContract } from './contract.ts';

runRepositoryContract('memory', createMemoryRepository, {
  importJobId: 'ij1',
  exportJobId: 'ej3',
  exportContainerId: 'xc3',
});
