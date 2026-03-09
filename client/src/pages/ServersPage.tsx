import { useState } from 'react';
import { useServers, useCreateServer, useDeleteServer, useTestServer, useUpdateServer } from '../api/servers';
import { Server as ServerIcon, Plus, Loader2 } from 'lucide-react';
import type { Server } from '../types';
import { ModalOverlay } from '../components/ModalOverlay';
import { ServerCard } from '../components/servers/ServerCard';
import { ServerForm } from '../components/servers/ServerForm';

export function ServersPage() {
  const { data: servers = [], isLoading } = useServers();
  const createServer = useCreateServer();
  const updateServer = useUpdateServer();
  const deleteServer = useDeleteServer();
  const testServer = useTestServer();
  const [showForm, setShowForm] = useState(false);
  const [editingServer, setEditingServer] = useState<Server | null>(null);

  const handleCreate = () => {
    setEditingServer(null);
    setShowForm(true);
  };

  const handleEdit = (server: Server) => {
    setEditingServer(server);
    setShowForm(true);
  };

  const handleCloseForm = () => {
    setShowForm(false);
    setEditingServer(null);
  };

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-white">Серверы</h1>
          <p className="text-gray-500 text-sm mt-1">Управление серверами для деплоя</p>
        </div>
        <button
          onClick={handleCreate}
          className="flex items-center gap-2 bg-indigo-600 hover:bg-indigo-500 text-white px-4 py-2 rounded-lg text-sm font-medium transition-colors"
        >
          <Plus className="w-4 h-4" />
          Добавить сервер
        </button>
      </div>

      {showForm && (
        <ModalOverlay onClose={handleCloseForm} ariaLabel={editingServer ? 'Редактировать сервер' : 'Добавить сервер'} className="z-[120] bg-black/80 p-4 backdrop-blur-sm">
          <div className="flex h-full items-center justify-center overflow-hidden">
            <ServerForm
              initialServer={editingServer}
              onClose={handleCloseForm}
              onCreate={createServer}
              onUpdate={updateServer}
            />
          </div>
        </ModalOverlay>
      )}

      {isLoading ? (
        <div className="flex justify-center p-12">
          <Loader2 className="w-6 h-6 animate-spin text-gray-500" />
        </div>
      ) : servers.length === 0 ? (
        <div className="text-center p-12 bg-gray-900 border border-gray-800 rounded-xl text-gray-500">
          <ServerIcon className="w-12 h-12 mx-auto mb-3 text-gray-700" />
          <p className="text-lg">Нет серверов</p>
          <p className="text-sm mt-1">Добавьте сервер для начала работы</p>
        </div>
      ) : (
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
          {servers.map((server) => (
            <ServerCard
              key={server.id}
              server={server}
              onEdit={handleEdit}
              onDelete={deleteServer}
              onTest={testServer}
            />
          ))}
        </div>
      )}
    </div>
  );
}
