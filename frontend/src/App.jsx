import React, { useEffect, useState } from 'react';
import FileTree from './components/FileTree';
import FileViewer from './components/FileViewer';

const API = '';

export default function App() {
  const [project, setProject] = useState(null);
  const [selectedPath, setSelectedPath] = useState('');
  const [fileContent, setFileContent] = useState('');
  const [gitBlameSegments, setGitBlameSegments] = useState(null);
  const [agentTraceBlame, setAgentTraceBlame] = useState(null);
  const [error, setError] = useState('');

  useEffect(() => {
    fetch(`${API}/api/project`)
      .then((r) => r.json())
      .then(setProject)
      .catch((e) => setError(String(e)));
  }, []);

  useEffect(() => {
    if (!selectedPath) {
      setFileContent('');
      setGitBlameSegments(null);
      setAgentTraceBlame(null);
      return;
    }
    setFileContent('Loading...');
    setGitBlameSegments(null);
    setAgentTraceBlame(null);
    fetch(`${API}/api/file?path=${encodeURIComponent(selectedPath)}`)
      .then((r) => {
        if (!r.ok) throw new Error(r.statusText);
        return r.text();
      })
      .then(setFileContent)
      .catch((e) => setFileContent(`Error: ${e.message}`));

    Promise.all([
      fetch(`${API}/api/git-blame?path=${encodeURIComponent(selectedPath)}`).then((r) =>
        r.ok ? r.json() : { segments: [] }
      ),
      fetch(`${API}/api/agent-trace-blame?path=${encodeURIComponent(selectedPath)}`).then((r) =>
        r.ok ? r.json() : { file: selectedPath, attributions: [] }
      ),
    ])
      .then(([gitData, agentData]) => {
        setGitBlameSegments(gitData.segments ?? []);
        setAgentTraceBlame(agentData);
      })
      .catch(() => {
        setGitBlameSegments([]);
        setAgentTraceBlame({ file: selectedPath, attributions: [] });
      });
  }, [selectedPath]);

  if (error) return <div style={{ padding: 16, color: 'red' }}>{error}</div>;
  if (!project) return <div style={{ padding: 16 }}>Loading project...</div>;

  return (
    <div style={{ display: 'flex', height: '100vh', overflow: 'hidden' }}>
      <aside
        style={{
          width: 280,
          borderRight: '1px solid #ccc',
          padding: 12,
          overflow: 'auto',
          flexShrink: 0,
        }}
      >
        <h2 style={{ margin: '0 0 8px 0', fontSize: 14 }}>Project</h2>
        <p style={{ margin: 0, fontSize: 12, color: '#666' }} title={project.root}>
          {project.root.replace(/^.*\//, '') || project.root}
        </p>
        <p style={{ margin: '4px 0 0 0', fontSize: 11, color: '#888' }}>
          Storage: {project.storage} · Agent-trace: {project.has_agent_trace ? 'yes' : 'no'}
        </p>
        <h3 style={{ margin: '12px 0 4px 0', fontSize: 12 }}>Files</h3>
        <FileTree
          selectedPath={selectedPath}
          onSelectFile={setSelectedPath}
          project={project}
        />
      </aside>
      <main style={{ flex: 1, display: 'flex', flexDirection: 'column', minWidth: 0, minHeight: 0, overflow: 'hidden' }}>
        {selectedPath ? (
          <>
            <div
              style={{
                padding: '4px 12px',
                borderBottom: '1px solid #e0e0e0',
                fontSize: 12,
                fontWeight: 500,
                backgroundColor: '#f8f8f8',
                flexShrink: 0,
              }}
            >
              {selectedPath}
            </div>
            <div style={{ flex: 1, minHeight: 0, overflow: 'hidden', display: 'flex', flexDirection: 'column' }}>
              {fileContent.startsWith('Error:') || fileContent === 'Loading...' ? (
                <pre style={{ margin: 16, fontFamily: 'inherit', color: fileContent.startsWith('Error:') ? 'red' : '#666' }}>
                  {fileContent}
                </pre>
              ) : (
                <FileViewer
                  path={selectedPath}
                  content={fileContent}
                  gitBlameSegments={gitBlameSegments}
                  agentTraceBlame={agentTraceBlame}
                />
              )}
            </div>
          </>
        ) : (
          <div style={{ padding: 16, color: '#888' }}>
            Select a file from the sidebar.
          </div>
        )}
      </main>
    </div>
  );
}
