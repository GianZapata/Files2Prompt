import type { PromptOutputDataSource } from '../../datasources/prompt-output.datasource';
import type { PromptBuild } from '../../entities/prompt-payload.entity';
import type {
  PromptRepository,
  PromptRequest
} from '../../repositories/prompt.repository';

import { CopyStop } from '../../entities/copy-stop.enum';

export interface CopyGate {
  tryStart(): boolean;
  finish(): void;
  isRunning?(): boolean;
}

export interface DeliverPromptResult {
  started: boolean;
  wrote: boolean;
  build?: PromptBuild;
}

export interface DeliverPromptUseCase {
  execute(
    request: PromptRequest,
    output: PromptOutputDataSource
  ): Promise<DeliverPromptResult>;
}

export class DeliverPrompt implements DeliverPromptUseCase {
  constructor(
    private readonly repository: PromptRepository,
    private readonly gate: CopyGate
  ) {}

  execute = async (
    request: PromptRequest,
    output: PromptOutputDataSource
  ): Promise<DeliverPromptResult> => {
    if (!this.gate.tryStart()) {
      return { started: false, wrote: false };
    }

    try {
      const build = await this.repository.build(request);

      if (build.stop === CopyStop.UserCancelled || build.output.length === 0) {
        return { started: true, wrote: false, build };
      }

      await output.write(build.output);

      return { started: true, wrote: true, build };
    } finally {
      this.gate.finish();
    }
  };
}
