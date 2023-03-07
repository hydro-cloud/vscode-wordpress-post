import * as vscode from "vscode";
import { Context } from "./context";
import { post, check } from "./post";

export function activate(context: vscode.ExtensionContext) {
  // Application Context
  const appContext = new Context(context);
  appContext.debug("activate");

  {
    let disposable = vscode.commands.registerCommand(
      "wordpress-post.post",
      async () => {
        try {
          await post(appContext);
        } catch (e: any) {
          vscode.window.showErrorMessage(e.message);
        }
      }
    );

    context.subscriptions.push(disposable);
  }


  {
    let disposable = vscode.commands.registerCommand(
      "wordpress-post.check",
      async () => {
        try {
          await check(appContext);
        } catch (e: any) {
          vscode.window.showErrorMessage(e.message);
        }
      }
    );

    context.subscriptions.push(disposable);
  }

  {
    let disposable = vscode.commands.registerCommand(
      "wordpress-post.markdown-clip-to-liner",
      async () => {
        try {
          const editor = vscode.window.activeTextEditor;
          if (!editor) {
            throw new Error("Please call from text file.");
          }
          // const document = editor.document;
          // const selection = editor.selection;
          // const text = document.getText(selection); //取得されたテキスト
          const text = await vscode.env.clipboard.readText();          // クリップボードからテキストを取得

          //
          let newText = text
            .replace(/\r\n/g, '\n')
            .replace(/\n/g, '\\n');

          // 入力したテキストをクリップボードへ設定
          await vscode.env.clipboard.writeText(newText);

          // キャレット位置に貼り付け
          // editor.edit((editBuilder) => {
          //   editBuilder.insert(editor.selection.active, newText);
          // });

          vscode.window.showInformationMessage('Save to Clipboard.');
        } catch (e: any) {
          vscode.window.showErrorMessage(e.message);
        }
      }
    );

    context.subscriptions.push(disposable);
  }


  {
    let disposable = vscode.commands.registerCommand(
      "wordpress-post.html-clip-to-liner",
      async () => {
        try {
          const editor = vscode.window.activeTextEditor;
          if (!editor) {
            throw new Error("Please call from text file.");
          }
          // const document = editor.document;
          // const selection = editor.selection;
          // const text = document.getText(selection); //取得されたテキスト
          const text = await vscode.env.clipboard.readText();          // クリップボードからテキストを取得
          //
          let newText = text
            .replace(/"/g, '\\"')
            .replace(/\r\n/g, '\n')
            .replace(/\n/g, '\\n');

          // 入力したテキストをクリップボードへ設定
          await vscode.env.clipboard.writeText(newText);
          //
          vscode.window.showInformationMessage('Save to Clipboard.');
        } catch (e: any) {
          vscode.window.showErrorMessage(e.message);
        }
      }
    );

    context.subscriptions.push(disposable);
  }

}


export function deactivate() { }
