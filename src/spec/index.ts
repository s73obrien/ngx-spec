import { strings } from '@angular-devkit/core';
import {
  Rule,
  SchematicContext,
  SchematicsException,
  Tree,
  apply,
  filter,
  mergeWith,
  move,
  template,
  url,
} from '@angular-devkit/schematics';
import { Schema as Options } from './schema';
import { Path, basename, dirname, normalize } from '@angular-devkit/core';
import { WorkspaceSchema } from '@angular-devkit/core/src/workspace';

const supportedTypes = ['component', 'directive', 'guard', 'service', 'pipe', 'module'];

export function getWorkspacePath(host: Tree): string {
  const possibleFiles = [ '/angular.json', '/.angular.json' ];
  const path = possibleFiles.filter(path => host.exists(path))[0];

  return path;
}

export function getWorkspace(host: Tree): WorkspaceSchema {
  const path = getWorkspacePath(host);
  const configBuffer = host.read(path);
  if (configBuffer === null) {
    throw new SchematicsException(`Could not find (${path})`);
  }
  const config = configBuffer.toString();

  return JSON.parse(config);
}

interface Location {
  name: string;
  path: Path;
}

function parseName(path: string, name: string): Location {
  const nameWithoutPath = basename(name as Path);
  const namePath = dirname((path + '/' + name) as Path);

  return {
    name: nameWithoutPath,
    path: normalize('/' + namePath),
  };
}

export default function (options: Options): Rule {
  return (host: Tree, context: SchematicContext) => {
    const workspace = getWorkspace(host);
    if (!options.project) {
      throw new SchematicsException('Option (project) is required.');
    }
    const project = workspace.projects[options.project];

    if (options.path === undefined) {
      const projectDirName = project.projectType === 'application' ? 'app' : 'lib';
      options.path = `/${project.root}/src/${projectDirName}`;
    }

    const parsedPath = parseName(options.path, options.name);

    const [, name, type] = parsedPath.name.replace(/\.ts$/, '').match(/(.*)\.([^.]+)$/) || [
      null,
      null,
      null,
    ];

    if (!name || !type) {
      throw new SchematicsException(
        'The provided name / file should look like name.type (e.g. component-name.component)'
        + ' or name.type.ts (e.g. component-name.component.ts).',
      );
    }

    if (!supportedTypes.includes(type)) {
      const ex = `The type "${ type }" is not supported. Please use one of [${
        supportedTypes.join(', ')
      }].`;

      throw new SchematicsException(ex);
    }

    options.name = name;
    options.path = parsedPath.path;

    const schematicsPath = require.resolve(`@schematics/angular/${type}/index.js`).replace(/index\.js$/, 'files');

    const templateSource = apply(url(schematicsPath), [
      filter(path => path.endsWith('.spec.ts')),
      template({
        ...strings,
        'if-flat': () => '',
        ...options,
      }),
      move(parsedPath.path),
    ]);

    return mergeWith(templateSource)(host, context);
  };
}
