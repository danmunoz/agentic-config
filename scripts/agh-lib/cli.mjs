import os from 'node:os';
import path from 'node:path';
import { configureAgentInstructions, configureGlobalSkills } from './config.mjs';
import {
  CONFIG_TARGETS,
  LOCAL_SKILL_PLATFORMS,
  getRepoScriptsDir,
  getRepoSkillfilePath,
} from './constants.mjs';
import {
  installManagedSkillEntry,
  removeManagedSkillEntry,
  validateManagedSkillEntry,
} from './managed-skills.mjs';
import {
  localRepoLockfileExists,
  readLocalRepoLockfile,
} from './local-repo-lockfile.mjs';
import { ensurePathBlock } from './path-config.mjs';
import { createUi } from './prompt.mjs';
import {
  checkScriptConfiguration,
  checkScriptRuntimes,
  installUvWithHomebrew,
} from './runtimes.mjs';
import {
  compareSkillEntries,
  readSkillfile,
  sameSkillEntry,
  writeSkillfile,
} from './skillfile.mjs';
import {
  applySkillSetup,
  collectSkillSources,
  copySkillsToProject,
  listGlobalSkillNames,
} from './skills.mjs';
import { formatList } from './utils.mjs';

function usageText() {
  return [
    'Usage:',
    '  agh install [--setup <path,config>] [--tools <comma-separated-tools>]',
    '  agh set-config [--tools <comma-separated-tools>]',
    '  agh set-skills [--scope <global|local|both>] [--platforms <comma-separated-platforms>] [--yes]',
    '  agh list [available|--available]',
    '  agh add <url> --skill <name> [--version <ref>] [--scope <global|local>] [--platform <platform>] [--source-path <path>] [--yes]',
    '  agh remove --skill <name> [--scope <global|local>] [--platform <platform>] [--url <url>] [--yes]',
    '',
    'Examples:',
    '  agh install',
    '  agh install --setup path',
    '  agh install --setup config --tools codex',
    '  agh set-config --tools opencode',
    '  agh set-skills --scope both --platforms ios,web --yes',
    '  agh list',
    '  agh list available',
    '  agh add https://github.com/AvdLee/Swift-Concurrency-Agent-Skill --skill swift-concurrency --version 2.1.1 --scope local --platform ios',
    '  agh remove --skill swift-concurrency --scope local --platform ios',
  ].join('\n');
}

function parseCommaList(value) {
  return value
    .split(',')
    .map((entry) => entry.trim())
    .filter(Boolean);
}

function initializeOptions(command) {
  return {
    command,
    scope: null,
    selectedPlatforms: null,
    selectedTools: null,
    selectedInstallComponents: null,
    url: null,
    skill: null,
    version: null,
    platform: null,
    sourcePath: null,
    available: false,
    yes: false,
  };
}

function parseInstallFlags(rest, options) {
  for (let index = 0; index < rest.length; index += 1) {
    const arg = rest[index];
    const value = rest[index + 1];
    if (!value) {
      throw new Error(`Missing value for ${arg}.`);
    }

    index += 1;
    if (arg === '--tools') {
      const selectedTools = parseCommaList(value);
      const validTools = CONFIG_TARGETS.map((target) => target.id);
      const invalidTools = selectedTools.filter((tool) => !validTools.includes(tool));
      if (invalidTools.length > 0) {
        throw new Error(
          `Invalid --tools value(s): ${invalidTools.join(', ')}. Expected one of: ${validTools.join(', ')}.`
        );
      }
      options.selectedTools = [...new Set(selectedTools)];
      continue;
    }

    if (arg === '--setup') {
      const selectedInstallComponents = parseCommaList(value);
      if (selectedInstallComponents.length === 0) {
        throw new Error('Invalid --setup value. Expected one or more of: path, config.');
      }
      const validComponents = ['path', 'config'];
      const invalidComponents = selectedInstallComponents.filter(
        (component) => !validComponents.includes(component)
      );
      if (invalidComponents.length > 0) {
        throw new Error(
          `Invalid --setup value(s): ${invalidComponents.join(', ')}. Expected one of: ${validComponents.join(', ')}.`
        );
      }
      options.selectedInstallComponents = [...new Set(selectedInstallComponents)];
      continue;
    }

    throw new Error(`Unknown flag "${arg}".`);
  }
}

function parseSetConfigFlags(rest, options) {
  for (let index = 0; index < rest.length; index += 1) {
    const arg = rest[index];
    const value = rest[index + 1];
    if (!value) {
      throw new Error(`Missing value for ${arg}.`);
    }

    index += 1;
    if (arg === '--tools') {
      const selectedTools = parseCommaList(value);
      const validTools = CONFIG_TARGETS.map((target) => target.id);
      const invalidTools = selectedTools.filter((tool) => !validTools.includes(tool));
      if (invalidTools.length > 0) {
        throw new Error(
          `Invalid --tools value(s): ${invalidTools.join(', ')}. Expected one of: ${validTools.join(', ')}.`
        );
      }
      options.selectedTools = [...new Set(selectedTools)];
      continue;
    }

    throw new Error(`Unknown flag "${arg}".`);
  }
}

function parseSetSkillsFlags(rest, options) {
  for (let index = 0; index < rest.length; index += 1) {
    const arg = rest[index];
    if (arg === '--yes') {
      options.yes = true;
      continue;
    }

    const value = rest[index + 1];
    if (!value) {
      throw new Error(`Missing value for ${arg}.`);
    }

    index += 1;
    if (arg === '--scope') {
      if (!['global', 'local', 'both'].includes(value)) {
        throw new Error('Invalid --scope value. Expected global, local, or both.');
      }
      options.scope = value;
      continue;
    }

    if (arg === '--platforms' || arg === '--types') {
      const selectedPlatforms = parseCommaList(value);
      const invalidPlatforms = selectedPlatforms.filter(
        (platform) => !LOCAL_SKILL_PLATFORMS.includes(platform)
      );
      if (invalidPlatforms.length > 0) {
        throw new Error(
          `Invalid --platforms value(s): ${invalidPlatforms.join(', ')}. Expected one of: ${LOCAL_SKILL_PLATFORMS.join(', ')}.`
        );
      }
      options.selectedPlatforms = [...new Set(selectedPlatforms)];
      continue;
    }

    if (arg === '--tools') {
      const selectedTools = parseCommaList(value);
      const validTools = CONFIG_TARGETS.map((target) => target.id);
      const invalidTools = selectedTools.filter((tool) => !validTools.includes(tool));
      if (invalidTools.length > 0) {
        throw new Error(
          `Invalid --tools value(s): ${invalidTools.join(', ')}. Expected one of: ${validTools.join(', ')}.`
        );
      }
      options.selectedTools = [...new Set(selectedTools)];
      continue;
    }

    throw new Error(`Unknown flag "${arg}".`);
  }
}

function parseAddRemoveFlags(rest, options, { allowPositionalUrl = false }) {
  let index = 0;

  if (allowPositionalUrl && rest[0] && !rest[0].startsWith('--')) {
    options.url = rest[0];
    index = 1;
  }

  for (; index < rest.length; index += 1) {
    const arg = rest[index];
    if (arg === '--yes') {
      options.yes = true;
      continue;
    }

    const value = rest[index + 1];
    if (!value) {
      throw new Error(`Missing value for ${arg}.`);
    }

    index += 1;
    switch (arg) {
      case '--url':
        options.url = value;
        break;
      case '--skill':
      case '--name':
        options.skill = value;
        break;
      case '--version':
        options.version = value;
        break;
      case '--scope':
        if (!['global', 'local'].includes(value)) {
          throw new Error('Invalid --scope value. Expected global or local.');
        }
        options.scope = value;
        break;
      case '--platform':
        if (!LOCAL_SKILL_PLATFORMS.includes(value)) {
          throw new Error(
            `Invalid --platform value "${value}". Expected one of: ${LOCAL_SKILL_PLATFORMS.join(', ')}.`
          );
        }
        options.platform = value;
        break;
      case '--source-path':
        options.sourcePath = value;
        break;
      default:
        throw new Error(`Unknown flag "${arg}".`);
    }
  }
}

function parseListFlags(rest, options) {
  for (const arg of rest) {
    if (arg === 'available' || arg === '--available') {
      options.available = true;
      continue;
    }

    throw new Error(`Unknown flag "${arg}".`);
  }
}

export function parseArgs(argv) {
  if (argv.length === 0 || argv.includes('--help') || argv.includes('-h')) {
    return { help: true, usage: usageText() };
  }

  const [command, ...rest] = argv;
  if (!['install', 'set-config', 'set-skills', 'list', 'add', 'remove'].includes(command)) {
    throw new Error(`Unknown command "${command}".`);
  }

  const options = initializeOptions(command);

  if (command === 'set-skills') {
    parseSetSkillsFlags(rest, options);
    return options;
  }

  if (command === 'install') {
    parseInstallFlags(rest, options);
    return options;
  }

  if (command === 'set-config') {
    parseSetConfigFlags(rest, options);
    return options;
  }

  if (command === 'list') {
    parseListFlags(rest, options);
    return options;
  }

  if (command === 'add') {
    parseAddRemoveFlags(rest, options, { allowPositionalUrl: true });
    if (!options.url) {
      throw new Error('Missing required URL argument.');
    }
    if (!options.skill) {
      throw new Error('Missing required flag --skill.');
    }
    return options;
  }

  parseAddRemoveFlags(rest, options, { allowPositionalUrl: false });
  if (!options.skill) {
    throw new Error('Missing required flag --skill.');
  }
  return options;
}

async function resolveScope(options, ui, { includeBoth = true } = {}) {
  if (options.scope) {
    return options.scope;
  }

  const choices = [
    {
      value: 'global',
      label: 'Global',
      hint: 'Link shared skills for all repos',
    },
    {
      value: 'local',
      label: 'Local',
      hint: 'Copy platform-specific skills into this repo',
    },
  ];

  if (includeBoth) {
    choices.push({
      value: 'both',
      label: 'Both',
      hint: 'Link global skills and copy local platform skills',
    });
  }

  return ui.select('Choose a scope:', choices);
}

function getPlatformHint(platform) {
  switch (platform) {
    case 'ios':
      return 'iOS and Apple-platform skills';
    case 'android':
      return 'Android skills';
    case 'web':
      return 'Web and frontend skills';
    default:
      return `${platform} skills`;
  }
}

async function resolveSelectedPlatforms(scope, options, ui) {
  if (!(scope === 'local' || scope === 'both')) {
    return [];
  }

  if (options.selectedPlatforms && options.selectedPlatforms.length > 0) {
    return options.selectedPlatforms;
  }

  return ui.multiselect(
    'Choose local platforms to copy into this repo:',
    LOCAL_SKILL_PLATFORMS.map((platform) => ({
      value: platform,
      label: platform,
      hint: getPlatformHint(platform),
    }))
  );
}

async function resolveLocalPlatform(options, ui) {
  if (options.platform) {
    return options.platform;
  }

  return ui.select(
    'Choose a local platform:',
    LOCAL_SKILL_PLATFORMS.map((platform) => ({
      value: platform,
      label: platform,
      hint: getPlatformHint(platform),
    }))
  );
}

async function resolveSelectedTools(options, ui) {
  if (options.selectedTools && options.selectedTools.length > 0) {
    return options.selectedTools;
  }

  if (!ui.isInteractive) {
    return CONFIG_TARGETS.map((target) => target.id);
  }

  return ui.multiselect(
    'Choose which agentic coding tools to configure:',
    CONFIG_TARGETS.map((target) => ({
      value: target.id,
      label: target.label,
      hint: path.join('~', ...target.relativePath),
    }))
  );
}

async function resolveInstallComponents(options, ui) {
  if (options.selectedInstallComponents && options.selectedInstallComponents.length > 0) {
    return options.selectedInstallComponents;
  }

  if (!ui.isInteractive) {
    return ['path', 'config'];
  }

  return ui.multiselect('Choose what agh install should set up:', [
    {
      value: 'path',
      label: 'Scripts PATH',
      hint: 'Add this repo scripts/ directory to shell PATH and check script runtimes',
    },
    {
      value: 'config',
      label: 'Agent instruction files',
      hint: 'Link Codex, Claude, or OpenCode instructions to AGENTS.MD',
    },
  ]);
}

function formatNameList(names) {
  return names.join(', ');
}

function renderSetSkillsPlan(scope, selectedPlatforms, localSkillNames, globalSkillNames) {
  const lines = [`Scope: ${scope === 'both' ? 'global + local' : scope}`];

  if (scope === 'global') {
    lines.push('Destination: ~/.agents/skills/custom');
    lines.push(
      `Will link: ${globalSkillNames.length > 0 ? formatNameList(globalSkillNames) : 'shared global skills'}`
    );
    return lines.join('\n');
  }

  if (scope === 'local') {
    lines.push(`Local platforms: ${selectedPlatforms.join(', ')}`);
    lines.push('Destination: .agents/skills/');
    if (localSkillNames.length > 0) {
      lines.push(`Will copy: ${formatNameList(localSkillNames)}`);
    }
    return lines.join('\n');
  }

  lines.push(`Local platforms: ${selectedPlatforms.join(', ')}`);
  lines.push('Destinations: ~/.agents/skills/custom, .agents/skills/');
  lines.push(
    `Will link: ${globalSkillNames.length > 0 ? formatNameList(globalSkillNames) : 'shared global skills'}`
  );
  if (localSkillNames.length > 0) {
    lines.push(`Will copy: ${formatNameList(localSkillNames)}`);
  }
  return lines.join('\n');
}

function renderAddPlan(entry) {
  const lines = [`Skill: ${entry.name}`, `URL: ${entry.url}`, `Scope: ${entry.scope}`];
  if (entry.version) {
    lines.push(`Version: ${entry.version}`);
  }
  if (entry.scope === 'local') {
    lines.push(`Platform: ${entry.platform}`);
    lines.push('Destination: .agents/skills/');
    lines.push(`Will copy: ${entry.name}`);
  } else {
    lines.push('Destination: ~/.agents/skills/custom');
    lines.push(`Will link: ${entry.name}`);
  }
  if (entry.sourcePath && entry.sourcePath !== entry.name) {
    lines.push(`Source path: ${entry.sourcePath}`);
  }
  return lines.join('\n');
}

function renderRemovePlan(entry) {
  const lines = [`Skill: ${entry.name}`, `URL: ${entry.url}`, `Scope: ${entry.scope}`];
  if (entry.scope === 'local') {
    lines.push(`Platform: ${entry.platform}`);
    lines.push(
      'Will remove from: skillfile.toml, skill-lock.json, skills/<platform>/, .agents/skills/, skills-lock.json'
    );
  } else {
    lines.push('Will remove from: skillfile.toml, skill-lock.json, skills/global/');
  }
  if (entry.version) {
    lines.push(`Version: ${entry.version}`);
  }
  if (entry.sourcePath && entry.sourcePath !== entry.name) {
    lines.push(`Source path: ${entry.sourcePath}`);
  }
  return lines.join('\n');
}

function renderConfigSummary(selectedTools) {
  return `Tools: ${selectedTools.join(', ')}`;
}

function renderInstallSummary(components, selectedTools) {
  const labels = components.map((component) =>
    component === 'path' ? 'scripts PATH' : 'agent instruction files'
  );
  const lines = [`Setup: ${labels.join(', ')}`];
  if (components.includes('config')) {
    lines.push(renderConfigSummary(selectedTools));
  }
  return lines.join('\n');
}

function reportRuntimeResults(runtimeResults, ui) {
  if (runtimeResults.length === 0) {
    return;
  }

  ui.info('Script runtimes:');
  for (const runtime of runtimeResults) {
    if (runtime.found) {
      ui.info(`- ${runtime.name}: found at ${runtime.path}`);
      continue;
    }

    ui.warn(`${runtime.name}: missing. ${runtime.purpose} ${runtime.installHint}`);
  }
}

function reportScriptConfiguration(configResults, ui) {
  if (configResults.length === 0) {
    return;
  }

  ui.info('Script configuration:');
  for (const config of configResults) {
    if (config.found) {
      ui.info(`- ${config.name}: found at ${config.path}`);
      continue;
    }

    ui.warn(`${config.name}: missing. ${config.purpose} ${config.setupHint}`);
  }
}

async function resolveScriptRuntimes(ui, deps) {
  let runtimeResults = await deps.checkScriptRuntimes();
  const missingUv = runtimeResults.find((runtime) => runtime.name === 'uv' && !runtime.found);

  if (!missingUv || !ui.isInteractive) {
    return runtimeResults;
  }

  const shouldInstall = await ui.confirm('uv is missing. Install uv using Homebrew now?');
  if (!shouldInstall) {
    return runtimeResults;
  }

  ui.startWork('Installing uv with Homebrew...');
  const installResult = await deps.installUvWithHomebrew();
  ui.stopWork();

  if (!installResult.installed) {
    ui.warn(`uv install failed. ${installResult.message}`);
    return runtimeResults;
  }

  ui.success('Installed uv with Homebrew.');
  runtimeResults = await deps.checkScriptRuntimes();
  return runtimeResults;
}

function formatSkillDescriptor(entry) {
  return entry.scope === 'global' ? `${entry.name} (global)` : `${entry.name} (local/${entry.platform})`;
}

function renderSkillList(items, emptyMessage) {
  if (items.length === 0) {
    return `- ${emptyMessage}`;
  }

  return formatList(items);
}

function normalizeEntryForManifest(entry) {
  return {
    url: entry.url,
    name: entry.name,
    version: entry.version ?? '',
    scope: entry.scope,
    platform: entry.scope === 'local' ? entry.platform : null,
    sourcePath: entry.sourcePath || entry.name,
  };
}

function findExactEntry(entries, entry) {
  return entries.find((candidate) => sameSkillEntry(candidate, entry)) ?? null;
}

function validateAddAgainstManifest(entries, entry) {
  const exactEntry = findExactEntry(entries, entry);
  if (exactEntry) {
    return { action: 'noop', message: `Skill "${entry.name}" is already present in skillfile.toml.` };
  }

  const sameTarget = entries.find(
    (candidate) =>
      candidate.name === entry.name &&
      candidate.url === entry.url &&
      candidate.scope === entry.scope &&
      (candidate.platform ?? null) === (entry.platform ?? null)
  );
  if (sameTarget) {
    throw new Error(
      `Skill "${entry.name}" from ${entry.url} already exists for this target. Remove it first if you want to change its version or source path.`
    );
  }

  const conflictingGlobalLocal = entries.find(
    (candidate) =>
      candidate.name === entry.name &&
      candidate.scope !== entry.scope
  );
  if (conflictingGlobalLocal) {
    throw new Error(
      `Skill "${entry.name}" is already listed as ${conflictingGlobalLocal.scope}. A skill cannot exist as both global and local.`
    );
  }

  return { action: 'add' };
}

function matchEntries(entries, options) {
  return entries.filter((entry) => {
    if (entry.name !== options.skill) return false;
    if (options.url && entry.url !== options.url) return false;
    if (options.scope && entry.scope !== options.scope) return false;
    if (options.platform && entry.platform !== options.platform) return false;
    return true;
  });
}

function renderAmbiguousEntryLabel(entry) {
  return `${entry.scope}${entry.platform ? `/${entry.platform}` : ''} · ${entry.name}`;
}

function renderAmbiguousEntryHint(entry) {
  const parts = [entry.url];
  if (entry.version) {
    parts.push(`version ${entry.version}`);
  }
  if (entry.sourcePath && entry.sourcePath !== entry.name) {
    parts.push(`source ${entry.sourcePath}`);
  }
  return parts.join(' · ');
}

async function chooseEntry(entries, ui) {
  if (!ui.isInteractive) {
    const lines = entries.map(
      (entry) =>
        `${renderAmbiguousEntryLabel(entry)} -> ${renderAmbiguousEntryHint(entry)}`
    );
    throw new Error(
      `Multiple matching skills found. Re-run interactively or narrow the command.\n${formatList(lines)}`
    );
  }

  return ui.select(
    'Choose which skill entry to use:',
    entries.map((entry, index) => ({
      value: String(index),
      label: renderAmbiguousEntryLabel(entry),
      hint: renderAmbiguousEntryHint(entry),
    }))
  ).then((value) => entries[Number(value)]);
}

async function handleInstall({ repoRoot, homeDir, ui, options, deps }) {
  const scriptsDir = getRepoScriptsDir(repoRoot);
  const rcFiles = [path.join(homeDir, '.zshrc'), path.join(homeDir, '.zprofile')];
  const pathResults = [];
  const selectedInstallComponents = await resolveInstallComponents(options, ui);
  const shouldConfigurePath = selectedInstallComponents.includes('path');
  const shouldConfigureInstructions = selectedInstallComponents.includes('config');
  const selectedTools = shouldConfigureInstructions ? await resolveSelectedTools(options, ui) : [];

  if (shouldConfigurePath) {
    for (const rcFile of rcFiles) {
      pathResults.push(await ensurePathBlock(rcFile, scriptsDir));
    }
  }

  ui.newline();
  ui.info('Install summary:');
  ui.info(renderInstallSummary(selectedInstallComponents, selectedTools));

  const runtimeResults = shouldConfigurePath ? await resolveScriptRuntimes(ui, deps) : [];
  const scriptConfigResults = shouldConfigurePath
    ? await deps.checkScriptConfiguration({ repoRoot })
    : [];
  const instructionResults = shouldConfigureInstructions
    ? await configureAgentInstructions({
        repoRoot,
        homeDir,
        selectedTools,
      })
    : [];

  ui.success('agh install complete.');
  if (shouldConfigurePath) {
    ui.info('Updated PATH in:');
    ui.info(formatList(pathResults.map((result) => result.path)));
    reportRuntimeResults(runtimeResults, ui);
    reportScriptConfiguration(scriptConfigResults, ui);
  }
  if (shouldConfigureInstructions) {
    ui.info('Configured instruction links:');
    ui.info(formatList(instructionResults.map((result) => `${result.label}: ${result.linkPath}`)));
  }
}

async function handleSetConfig({ repoRoot, homeDir, ui, options }) {
  const selectedTools = await resolveSelectedTools(options, ui);
  ui.newline();
  ui.info('Config summary:');
  ui.info(renderConfigSummary(selectedTools));

  const results = await configureAgentInstructions({
    repoRoot,
    homeDir,
    selectedTools,
  });
  ui.success('Global instruction links configured.');
  ui.info(formatList(results.map((result) => `${result.label}: ${result.linkPath}`)));
}

async function handleList({ repoRoot, cwd, ui, options, deps }) {
  const skillfilePath = getRepoSkillfilePath(repoRoot);
  const entries = await deps.readSkillfile(skillfilePath);
  const scopedEntries = options.available
    ? [...entries].sort(compareSkillEntries)
    : entries.filter((entry) => entry.scope === 'global').sort(compareSkillEntries);
  const localLockExists = await deps.localRepoLockfileExists(cwd);
  const localSkills = localLockExists ? await deps.readLocalRepoLockfile(cwd) : [];

  ui.title('Skill List');
  ui.info(options.available ? 'Available skills from skillfile.toml:' : 'Global skills from skillfile.toml:');
  ui.info(
    renderSkillList(
      scopedEntries.map((entry) => (options.available ? formatSkillDescriptor(entry) : entry.name)),
      options.available ? 'No skills defined in skillfile.toml.' : 'No global skills defined in skillfile.toml.'
    )
  );
  ui.newline();

  if (!localLockExists) {
    ui.info('Local skills in current repo:');
    ui.info('- No local skills found in current repo.');
    return;
  }

  ui.info('Local skills in current repo:');
  ui.info(
    renderSkillList(
      localSkills.map((entry) => entry.name),
      'No local skills found in current repo.'
    )
  );
}

async function handleSetSkills({ repoRoot, cwd, homeDir, ui, options, deps }) {
  ui.title('Set Up Skills');
  ui.info(
    'Sync managed skills from skillfile.toml, then link global skills and/or copy local platform skills into this repo.'
  );
  ui.newline();

  const scope = await resolveScope(options, ui);
  const selectedPlatforms = await resolveSelectedPlatforms(scope, options, ui);
  const localSkillSources =
    scope === 'local' || scope === 'both'
      ? await deps.collectSkillSources(repoRoot, selectedPlatforms)
      : [];
  const localSkillNames = localSkillSources.map((skill) => skill.name);
  const globalSkillNames =
    scope === 'global' || scope === 'both' ? await deps.listGlobalSkillNames(repoRoot) : [];

  ui.newline();
  ui.section('Plan');
  ui.info(renderSetSkillsPlan(scope, selectedPlatforms, localSkillNames, globalSkillNames));

  if (!options.yes) {
    ui.newline();
    const approved = await ui.confirm('Continue?');
    if (!approved) {
      throw new Error('Cancelled.');
    }
  }

  let result;
  try {
    ui.startWork('Syncing managed skills and applying your selected scope...');
    result = await deps.applySkillSetup(
      {
        repoRoot,
        projectRoot: cwd,
        homeDir,
        scope,
        selectedPlatforms,
      },
      { syncSkills: deps.syncSkills }
    );
  } finally {
    ui.stopWork();
  }

  ui.newline();
  ui.success('Skill setup complete.');
  ui.info(
    `Managed sync: ${result.syncResult.changedCount} updated, ${result.syncResult.removedCount} removed, ${result.syncResult.skippedCount} already current.`
  );

  if (result.globalResult) {
    ui.info('Global skills are linked.');
  }

  if (result.copiedSkills.length > 0) {
    ui.info(
      `Copied into this repo: ${formatNameList(result.copiedSkills.map((skill) => skill.name))}`
    );
  }

  if (result.skippedSkills.length > 0) {
    ui.info(
      `Already current in this repo: ${formatNameList(result.skippedSkills.map((skill) => skill.name))}`
    );
  }
}

async function handleAdd({ repoRoot, cwd, homeDir, ui, options, deps }) {
  ui.title('Add Skill');
  ui.info('Add a new skill to skillfile.toml, validate it, and apply it immediately.');
  ui.newline();

  const scope = await resolveScope({ scope: options.scope }, ui, { includeBoth: false });
  const platform = scope === 'local' ? await resolveLocalPlatform(options, ui) : null;
  const entry = normalizeEntryForManifest({
    url: options.url,
    name: options.skill,
    version: options.version ?? '',
    scope,
    platform,
    sourcePath: options.sourcePath || options.skill,
  });

  const skillfilePath = getRepoSkillfilePath(repoRoot);
  const existingEntries = await deps.readSkillfile(skillfilePath);
  const validation = validateAddAgainstManifest(existingEntries, entry);
  if (validation.action === 'noop') {
    ui.info(validation.message);
    return;
  }

  ui.newline();
  ui.section('Plan');
  ui.info(renderAddPlan(entry));

  if (!options.yes) {
    ui.newline();
    const approved = await ui.confirm('Continue?');
    if (!approved) {
      throw new Error('Cancelled.');
    }
  }

  const nextEntries = [...existingEntries, entry].sort(compareSkillEntries);
  let installResult = null;

  try {
    ui.startWork('Validating and installing the new skill...');
    await deps.validateManagedSkillEntry(entry);
    await deps.writeSkillfile(skillfilePath, nextEntries);
    installResult = await deps.installManagedSkillEntry(entry, { repoRoot });

    if (entry.scope === 'global') {
      await deps.configureGlobalSkills({ repoRoot, homeDir });
    } else {
      const skillSources = await deps.collectSkillSources(repoRoot, [entry.platform]);
      const skillSource = skillSources.find((skill) => skill.name === entry.name);
      if (!skillSource) {
        throw new Error(`Installed skill "${entry.name}" could not be located for copying.`);
      }
      const copyResult = await deps.copySkillsToProject([skillSource], cwd);
      if (copyResult.copied.length === 0 && copyResult.skipped.length === 0) {
        throw new Error(`Installed skill "${entry.name}" could not be copied into this repo.`);
      }
    }
  } catch (error) {
    await deps.writeSkillfile(skillfilePath, existingEntries);
    if (installResult && installResult.action !== 'skipped') {
      try {
        await deps.removeManagedSkillEntry(entry, { repoRoot, projectRoot: cwd });
      } catch {
        // Best-effort cleanup after rollback.
      }
    }
    throw error;
  } finally {
    ui.stopWork();
  }

  ui.newline();
  ui.success(`Skill "${entry.name}" added.`);
  if (entry.scope === 'global') {
    ui.info('Global skills are linked.');
  } else {
    ui.info(`Copied into this repo: ${entry.name}`);
  }
}

async function handleRemove({ repoRoot, cwd, ui, options, deps }) {
  ui.title('Remove Skill');
  ui.info('Remove a skill from skillfile.toml, managed installs, and local repo copies.');
  ui.newline();

  const skillfilePath = getRepoSkillfilePath(repoRoot);
  const existingEntries = await deps.readSkillfile(skillfilePath);
  const matches = matchEntries(existingEntries, options);

  if (matches.length === 0) {
    throw new Error(`Skill "${options.skill}" was not found in skillfile.toml.`);
  }

  const targetEntry =
    matches.length === 1 ? matches[0] : await chooseEntry(matches, ui);

  ui.newline();
  ui.section('Plan');
  ui.info(renderRemovePlan(targetEntry));

  if (!options.yes) {
    ui.newline();
    const approved = await ui.confirm('Continue?');
    if (!approved) {
      throw new Error('Cancelled.');
    }
  }

  const nextEntries = existingEntries.filter((entry) => !sameSkillEntry(entry, targetEntry));

  try {
    ui.startWork('Removing the selected skill...');
    await deps.writeSkillfile(skillfilePath, nextEntries);
    await deps.removeManagedSkillEntry(targetEntry, { repoRoot, projectRoot: cwd });
  } catch (error) {
    await deps.writeSkillfile(skillfilePath, existingEntries);
    throw error;
  } finally {
    ui.stopWork();
  }

  ui.newline();
  ui.success(`Skill "${targetEntry.name}" removed.`);
}

export async function runCli(
  argv,
  {
    repoRoot,
    cwd = process.cwd(),
    homeDir = os.homedir(),
    ui = createUi(),
    syncSkills,
    deps = {},
  } = {}
) {
  let parsed;

  try {
    parsed = parseArgs(argv);
  } catch (error) {
    ui.error(error.message);
    ui.newline();
    ui.info(usageText());
    return 1;
  }

  if (parsed.help) {
    ui.info(parsed.usage);
    return 0;
  }

  const resolvedDeps = {
    applySkillSetup,
    collectSkillSources,
    configureGlobalSkills,
    copySkillsToProject,
    installManagedSkillEntry,
    listGlobalSkillNames,
    localRepoLockfileExists,
    readSkillfile,
    readLocalRepoLockfile,
    removeManagedSkillEntry,
    syncSkills,
    checkScriptConfiguration,
    checkScriptRuntimes,
    installUvWithHomebrew,
    validateManagedSkillEntry,
    writeSkillfile,
    ...deps,
  };

  try {
    if (parsed.command === 'install') {
      await handleInstall({ repoRoot, homeDir, ui, options: parsed, deps: resolvedDeps });
      return 0;
    }

    if (parsed.command === 'set-config') {
      await handleSetConfig({ repoRoot, homeDir, ui, options: parsed });
      return 0;
    }

    if (parsed.command === 'set-skills') {
      await handleSetSkills({
        repoRoot,
        cwd,
        homeDir,
        ui,
        options: parsed,
        deps: resolvedDeps,
      });
      return 0;
    }

    if (parsed.command === 'list') {
      await handleList({
        repoRoot,
        cwd,
        ui,
        options: parsed,
        deps: resolvedDeps,
      });
      return 0;
    }

    if (parsed.command === 'add') {
      await handleAdd({
        repoRoot,
        cwd,
        homeDir,
        ui,
        options: parsed,
        deps: resolvedDeps,
      });
      return 0;
    }

    await handleRemove({
      repoRoot,
      cwd,
      ui,
      options: parsed,
      deps: resolvedDeps,
    });
    return 0;
  } catch (error) {
    ui.error(error.message);
    return 1;
  }
}
