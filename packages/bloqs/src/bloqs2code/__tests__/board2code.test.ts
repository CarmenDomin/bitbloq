/*
 * File: board2code.test.ts
 * Project: Bitbloq
 * License: MIT (https://opensource.org/licenses/MIT)
 * Bitbloq Repository: https://github.com/bitbloq
 * Bitbloq Team: https://github.com/orgs/Bitbloq/people
 * Copyright 2018 - 2019 BQ Educacion.
 */

import board2code from '../board2code';
import { IHardware, IArduinoCode } from '../..';
import { boards } from './config/boards';

const hardware: IHardware = {
  board: 'zumjunior',
  components: []
};

test('board2code', () => {
  const includes: string[] = [];
  const globals: string[] = [];
  const setup: string[] = [];
  const loop: string[] = [];
  const definitions: string[] = [];

  const arduinoCode: IArduinoCode = {
    includes,
    globals,
    setup,
    loop,
    definitions,
  };

  try {
    board2code(boards, hardware, arduinoCode);
  } catch (e) {
    throw e;
  }

  expect(1).toBe(1);
});
