export interface UserStateMigration {
  readonly id: number;
  readonly name: string;
  readonly statements: ReadonlyArray<string>;
}

const splitStatements = (sql: string): ReadonlyArray<string> =>
  sql
    .split(';')
    .map((statement) => statement.trim())
    .filter((statement) => statement.length > 0);

export const makeInitialUserStateMigration = (sql: string): UserStateMigration => ({
  id: 1,
  name: 'user-state',
  statements: splitStatements(sql),
});
