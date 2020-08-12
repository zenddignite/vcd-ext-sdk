/**
 * This new version of the builder shims the basics which
 * has to be covered in future, additinal work is expected.
 * Most of the functionallity which has to be implemented here is
 * well described in the base plugin builder.
 */

// Angular builder
import { executeBrowserBuilder } from '@angular-devkit/build-angular';
import { buildBrowserWebpackConfigFromContext } from '@angular-devkit/build-angular/src/browser';
import * as fs from 'fs';
import * as path from 'path';
// Builder bootstrap dependencies
import { BuilderContext, BuilderOutput, createBuilder } from '@angular-devkit/architect';
import { NormalizedBrowserBuilderSchema } from '@angular-devkit/build-angular/src/utils/normalize-builder-schema';
import { LibrariesConfig, ExtensionManifest } from "../common/interfaces";
import { extractExternalRegExps, splitVendorsIntoChunks, processManifestJsonFile, VCD_CUSTOM_LIB_SEPARATOR } from "../common/utilites";
import { ConcatWebpackPlugin } from "../common/concat";
import * as ZipPlugin from 'zip-webpack-plugin';

interface Options extends NormalizedBrowserBuilderSchema {
  enableIncrementalLoading: boolean;
  	/**
	 * A string of the form `path/to/file#exportName`
		 * that acts as a path to include to bundle.
	 */
	modulePath: string;
	/**
	 * List of external libraries defined by the user.
	 */
	externalLibs: string[];
	/**
	 * Will disable the default external libraries,
	 * allowing the user to define his own thanks to externalLibs property.
	 */
	ignoreDefaultExternals: boolean;
	/**
	 * List of libraries determining thier version, scope and file name (location). 
	 */
	librariesConfig: LibrariesConfig;
}

export const defaultExternals = {
	common: [
		/^@angular\/.+$/,
		/^@ngrx\/.+$/,
		/^@vcd\/common$/,
		/^@vcd-ui\/common$/,
		{
			reselect: 'reselect'
		}
	],
	["9.7-10.0"]: [
		/^rxjs(\/.+)?$/,
		/^@clr\/.+$/,
		{
			'clarity-angular': 'clarity-angular',
		}
	]
}

export default createBuilder(commandBuilder as () => Promise<BuilderOutput>);

async function commandBuilder(
  options: Options,
  context: BuilderContext,
  ): Promise<BuilderOutput> {
    if (!options.modulePath) {
			throw Error('Please define modulePath!');
		}

    // Build webpack configurtion
		const configs = await buildBrowserWebpackConfigFromContext(options, context);
		const pluginLibsBundles = new Map<string, string>();

    // Get the configuration
    const config = configs.config[0];

    // Make sure we are producing a single bundle
    delete config.entry.polyfills;
    delete config.optimization.runtimeChunk;
    delete config.optimization.splitChunks;
    delete config.entry.styles;
    delete config.entry["polyfills-es5"];

    // List the external libraries which will be provided by vcd
		config.externals = [
			...(options.ignoreDefaultExternals ? [] : defaultExternals.common),
			...(!options.enableIncrementalLoading && !options.ignoreDefaultExternals ? defaultExternals["9.7-10.0"] : []),
			...extractExternalRegExps(options.externalLibs),
		];

    // preserve path to entry point
    // so that we can clear use it within `run` method to clear that file
    const entryPointPath = config.entry.main[0];
    const entryPointOriginalContent = fs.readFileSync(entryPointPath, "utf-8");
    
    // Patch the main.ts file to point to the plugin which will be compiled
    // tslint:disable-next-line:prefer-const
    let [modulePath, moduleName] = options.modulePath.split('#');

    if (options.enableIncrementalLoading) {
			// Create unique jsonpFunction name
			const copyPlugin = config.plugins.find((x) => x && x.patterns);
			const manifestJsonPath = path.join(copyPlugin.patterns[0].context, "manifest.json");
			const manifest: ExtensionManifest = JSON.parse(fs.readFileSync(manifestJsonPath, "utf-8"));
			config.output.jsonpFunction = `vcdJsonp#${moduleName}#${manifest.urn}`;

			// Configure the vendor chunks
			config.optimization.splitChunks = {
				chunks: "all",
				cacheGroups: {
					vendor: {
						test(mod) {
							if (!mod.context) {
								return false;
							}
						
							// Only node_modules are needed and these which are defiend in the librariesConfig
							if (
								!mod.context.includes('node_modules') ||
								!Object.keys(options.librariesConfig).some((key) => {
									return mod.context.includes(key)
								})
							) {
								return false;
							}

							return true;
						},
						name(module) {
							return splitVendorsIntoChunks(module, config.context, options.librariesConfig, (packageName: string) => {
								packageName = packageName.replace(VCD_CUSTOM_LIB_SEPARATOR, "/");
								pluginLibsBundles.set(packageName, `${packageName}.bundle.js`)
							});
						},
					},
				},
			};

			// Transform manifest json file.
			copyPlugin.patterns[0].transform = processManifestJsonFile(
				options.librariesConfig || {},
				pluginLibsBundles,
				config.output.jsonpFunction
			);
		}

    // Export the plugin module
    modulePath = modulePath.substr(0, modulePath.indexOf(".ts"));
    const entryPointContents = `export * from '${modulePath}';`;
    patchEntryPoint(entryPointPath, entryPointContents);

		// Define amd lib
    config.output.filename = 'bundle.js';
    config.output.library = moduleName;
    config.output.libraryTarget = 'amd';
    // workaround to support bundle on nodejs
    config.output.globalObject = `(typeof self !== 'undefined' ? self : this)`;
    
    if (!config.plugins || !config.plugins.length) {
      config.plugins = [];
    }

    // Get the angular compiler
    const ngCompilerPluginInstance = config.plugins.find(
      x => x.constructor && x.constructor.name === 'AngularCompilerPlugin'
    );
    if (ngCompilerPluginInstance) {
      ngCompilerPluginInstance._entryModule = modulePath;
    }

    if (options.enableIncrementalLoading) {
			config.plugins.push(
				new ConcatWebpackPlugin({
					concat: [
						{
							inputs: [
								"bundle.js",
								"vendors~main.bundle.js"
							],
							output: "bundle.js"
						}
					]
				})
			);
		}

    // Zip the result
		config.plugins.push(
			new ZipPlugin({
				filename: 'plugin.zip',
				exclude: [
					/\.html$/,
					...Object.keys(options.librariesConfig)
					.filter((key) => {
						return options.librariesConfig[key].scope === "provided";
					})
					.map((key) => {
						const libBundleName = `${key.replace("/", VCD_CUSTOM_LIB_SEPARATOR)}@${options.librariesConfig[key].version}.bundle.js`
						return libBundleName
					})
				]
			}),
		);

    options.fileReplacements = options.fileReplacements && options.fileReplacements.length ? options.fileReplacements : [];
    options.styles = options.styles && options.styles.length ? options.styles : [];
    options.scripts = options.scripts && options.scripts.length ? options.scripts : [];

    // Trigger the angular browser builder
    return executeBrowserBuilder(options, context, {
      webpackConfiguration: () => (config)
    })
    .toPromise()
    .then(() => {
      patchEntryPoint(entryPointPath, entryPointOriginalContent);
      return Promise.resolve({ success: true });
    })
    .catch((e) => {
      console.error(e);
      patchEntryPoint(entryPointPath, entryPointOriginalContent);
      context.logger.error(e);
      return Promise.reject({ success: false });
    });
}

function patchEntryPoint(entryPointPath: string, contents: string) {
  fs.writeFileSync(entryPointPath, contents);
}