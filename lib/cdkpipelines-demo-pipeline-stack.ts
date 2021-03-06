import * as codepipeline from '@aws-cdk/aws-codepipeline';
import * as codepipeline_actions from '@aws-cdk/aws-codepipeline-actions';
import { Construct, SecretValue, Stack, StackProps, Environment } from '@aws-cdk/core';
import { CdkPipeline, CdkStage, SimpleSynthAction, ShellScriptAction } from '@aws-cdk/pipelines';
import { CdkpipelinesDemoStage } from './cdkpipelines-demo-stage';

/**
 * The stack that defines the application pipeline
 */
export class CdkpipelinesDemoPipelineStack extends Stack {
    constructor(scope: Construct, id: string, props?: StackProps) {
        super(scope, id, props);

        const sourceArtifact = new codepipeline.Artifact();
        const cloudAssemblyArtifact = new codepipeline.Artifact();

        const pipeline = new CdkPipeline(this, 'Pipeline', {
            // The pipeline name
            pipelineName: 'MyServicePipeline',
            cloudAssemblyArtifact,

            // Where the source can be found
            sourceAction: new codepipeline_actions.GitHubSourceAction({
                actionName: 'GitHub',
                output: sourceArtifact,
                oauthToken: SecretValue.secretsManager('github-token'),
                owner: 'eckz',
                repo: 'cdkpipelines-demo',
                trigger: codepipeline_actions.GitHubTrigger.POLL,
            }),

            // How it will be built and synthesized
            synthAction: SimpleSynthAction.standardNpmSynth({
                sourceArtifact,
                cloudAssemblyArtifact,

                // We need a build step to compile the TypeScript Lambda
                buildCommand: 'npm run build'
            }),
        });

        // This is where we add the application stages
        const preProd = pipeline.addStage('PreProd');
        this.addApplicationStack(pipeline, preProd, 'PreProd', { account: '506729077343', region: 'eu-west-3' });

        const prod = pipeline.addStage('Prod');
        this.addApplicationStack(pipeline, prod, 'Prod-us-west-2', { account: '310767087164', region: 'us-west-2' });
        this.addApplicationStack(pipeline, prod, 'Prod-us-east-2', { account: '310767087164', region: 'us-east-2' });
    }

    addApplicationStack(pipeline: CdkPipeline, stage: CdkStage, name: string, env: Environment) {
        const app = new CdkpipelinesDemoStage(this, name, { env });
        stage.addApplication(app);
        stage.addActions(new ShellScriptAction({
            actionName: `${name}-Test`,
            useOutputs: {
                // Get the stack Output from the Stage and make it available in
                // the shell script as $ENDPOINT_URL.
                ENDPOINT_URL: pipeline.stackOutput(app.urlOutput),
            },
            commands: [
                'echo Testing $ENDPOINT_URL',
                // Use 'curl' to GET the given URL and fail if it returns an error
                'curl -Ssf $ENDPOINT_URL',
            ],
        }));
    }
}