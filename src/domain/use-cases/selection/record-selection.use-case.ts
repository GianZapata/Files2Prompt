import type { StateDataSource } from '../../datasources/state.datasource';
import type { SelectionSnapshot } from '../../entities/selection-snapshot.entity';
import type { SelectionHistory } from '../../services/selection-history.service';

export interface RecordSelectionRequest {
  snapshot: SelectionSnapshot;
}

export interface RecordSelectionUseCase {
  execute(request: RecordSelectionRequest): Promise<void>;
}

export class RecordSelection implements RecordSelectionUseCase {
  constructor(
    private readonly history: SelectionHistory,
    private readonly stateDataSource: StateDataSource,
    private readonly onSelectionRecorded?: () => void
  ) {}

  execute = async (request: RecordSelectionRequest): Promise<void> => {
    this.history.record(request.snapshot);

    await this.stateDataSource.update('files2prompt.selectionHistory', {
      entries: this.history.entries().slice(-20),
      position: this.history.position()
    });

    this.onSelectionRecorded?.();
  };
}
