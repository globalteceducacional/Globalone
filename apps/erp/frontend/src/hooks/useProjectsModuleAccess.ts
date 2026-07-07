import { useEffect, useState } from 'react';
import { api } from '../services/api';
import { Projeto } from '../types';
import { useAuthStore } from '../store/auth';
import { cargoAllowsProjectsPage, userHasPermission } from '../utils/projectAccess';

/**
 * Acesso ao módulo /projects (lista + rotas filhas): cargo com /projects e,
 * se não tiver projetos:ver_todos, apenas quando supervisiona ao menos um projeto.
 */
export function useProjectsModuleAccess() {
  const user = useAuthStore((s) => s.user);
  const [ready, setReady] = useState(false);
  const [supervisesAnyProject, setSupervisesAnyProject] = useState(false);

  const needsSupervisorCheck = !userHasPermission(user, 'projetos:ver_todos') && !!user;
  const cargoProjects = cargoAllowsProjectsPage(user);

  useEffect(() => {
    let cancelled = false;

    if (!user) {
      setSupervisesAnyProject(false);
      setReady(true);
      return;
    }

    if (!cargoProjects || !needsSupervisorCheck) {
      setSupervisesAnyProject(true);
      setReady(true);
      return;
    }

    setReady(false);
    api
      .get<Projeto[]>('/projects')
      .then(({ data }) => {
        if (cancelled) return;
        const uid = Number(user.id);
        setSupervisesAnyProject(data.some((p) => Number(p.supervisor?.id) === uid));
        setReady(true);
      })
      .catch(() => {
        if (cancelled) return;
        setSupervisesAnyProject(false);
        setReady(true);
      });

    return () => {
      cancelled = true;
    };
  }, [user?.id, needsSupervisorCheck, cargoProjects]);

  const loadingProjectsAccess = cargoProjects && needsSupervisorCheck && !ready;
  const canAccessProjectsModule = cargoProjects && (!needsSupervisorCheck || supervisesAnyProject);

  return { canAccessProjectsModule, loadingProjectsAccess };
}
