import readline from 'node:readline/promises';

function write(stream, message = '') {
  stream.write(`${message}\n`);
}

const color = {
  reset: '\x1b[0m',
  bold: '\x1b[1m',
  dim: '\x1b[2m',
  cyan: '\x1b[36m',
  green: '\x1b[32m',
  yellow: '\x1b[33m',
  red: '\x1b[31m',
  white: '\x1b[37m',
};

function paint(code, value) {
  return `${code}${value}${color.reset}`;
}

function bold(value) {
  return paint(color.bold, value);
}

function dim(value) {
  return paint(color.dim, value);
}

function cyan(value) {
  return paint(color.cyan, value);
}

function green(value) {
  return paint(color.green, value);
}

function yellow(value) {
  return paint(color.yellow, value);
}

function red(value) {
  return paint(color.red, value);
}

function renderHeader(message) {
  return `${cyan('==>')} ${bold(message)}`;
}

function renderSectionLabel(message) {
  return `${cyan(bold(message))}`;
}

export function createUi({
  stdin = process.stdin,
  stdout = process.stdout,
  stderr = process.stderr,
  isInteractive = Boolean(process.stdin.isTTY && process.stdout.isTTY),
} = {}) {
  let spinnerTimer = null;
  let spinnerFrameIndex = 0;
  let spinnerMessage = '';
  const spinnerFrames = ['|', '/', '-', '\\'];

  async function withReadline(callback) {
    const rl = readline.createInterface({ input: stdin, output: stdout });
    try {
      return await callback(rl);
    } finally {
      rl.close();
    }
  }

  function clearSpinnerLine() {
    if (!stdout.isTTY) {
      return;
    }
    stdout.write('\r\x1b[2K');
  }

  function stopSpinner({ finalMessage = null } = {}) {
    if (spinnerTimer) {
      clearInterval(spinnerTimer);
      spinnerTimer = null;
    }

    if (spinnerMessage) {
      clearSpinnerLine();
      if (finalMessage) {
        write(stdout, finalMessage);
      }
      spinnerMessage = '';
    }
  }

  return {
    stdin,
    stdout,
    stderr,
    isInteractive,
    title(message) {
      write(stdout, renderHeader(message));
    },
    section(message) {
      write(stdout, renderSectionLabel(message));
    },
    info(message) {
      write(stdout, message);
    },
    success(message) {
      write(stdout, `${green('[ok]')} ${message}`);
    },
    warn(message) {
      write(stderr, `${yellow('[warn]')} ${message}`);
    },
    error(message) {
      write(stderr, `${red('[error]')} ${message}`);
    },
    startWork(message) {
      stopSpinner();

      if (!isInteractive || !stdout.isTTY) {
        write(stdout, `${cyan('[working]')} ${message}`);
        return;
      }

      spinnerMessage = message;
      spinnerFrameIndex = 0;
      stdout.write(`${cyan('[working]')} ${spinnerFrames[spinnerFrameIndex]} ${message}`);
      spinnerTimer = setInterval(() => {
        spinnerFrameIndex = (spinnerFrameIndex + 1) % spinnerFrames.length;
        clearSpinnerLine();
        stdout.write(`${cyan('[working]')} ${spinnerFrames[spinnerFrameIndex]} ${spinnerMessage}`);
      }, 100);
    },
    stopWork() {
      stopSpinner();
    },
    newline() {
      write(stdout);
    },
    async select(message, options) {
      if (!isInteractive) {
        throw new Error('Interactive selection required. Re-run in a TTY or pass flags.');
      }

      write(stdout, renderHeader(message));
      write(stdout, dim('Use the number shown for the option you want.'));
      for (let index = 0; index < options.length; index += 1) {
        const option = options[index];
        write(stdout, `  ${cyan(String(index + 1).padStart(2, ' '))}  ${bold(option.label)}`);
        if (option.hint) {
          write(stdout, `      ${dim(option.hint)}`);
        }
      }

      return withReadline(async (rl) => {
        while (true) {
          const answer = (await rl.question(`${cyan('choice')} > `)).trim();
          const choice = Number(answer);
          if (Number.isInteger(choice) && choice >= 1 && choice <= options.length) {
            write(stdout);
            return options[choice - 1].value;
          }
          write(stderr, `${red('Enter one of the listed numbers.')}`);
        }
      });
    },
    async multiselect(message, options) {
      if (!isInteractive) {
        throw new Error('Interactive selection required. Re-run in a TTY or pass flags.');
      }

      const example = options.length >= 3 ? '1,3' : options.length === 2 ? '1,2' : '1';
      write(stdout, renderHeader(message));
      write(stdout, dim(`Use comma-separated numbers. Example: ${example}`));
      for (let index = 0; index < options.length; index += 1) {
        const option = options[index];
        write(stdout, `  ${cyan(String(index + 1).padStart(2, ' '))}  ${bold(option.label)}`);
        if (option.hint) {
          write(stdout, `      ${dim(option.hint)}`);
        }
      }

      return withReadline(async (rl) => {
        while (true) {
          const answer = (await rl.question(`${cyan('choices')} > `)).trim();
          const parts = answer.split(',').map((part) => part.trim()).filter(Boolean);
          const indexes = [...new Set(parts.map((part) => Number(part)))];
          const valid = indexes.every(
            (value) => Number.isInteger(value) && value >= 1 && value <= options.length
          );

          if (valid && indexes.length > 0) {
            write(stdout);
            return indexes.map((value) => options[value - 1].value);
          }

          write(stderr, `${red('Enter one or more valid numbers.')}`);
        }
      });
    },
    async confirm(message) {
      if (!isInteractive) {
        return false;
      }

      return withReadline(async (rl) => {
        write(stdout, renderHeader(message));
        const answer = (await rl.question(`${cyan('confirm')} [y/N] > `)).trim();
        write(stdout);
        return /^(y|yes)$/i.test(answer);
      });
    },
  };
}
