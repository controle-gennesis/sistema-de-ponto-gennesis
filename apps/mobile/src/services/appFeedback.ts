import api from './api';
import { readApiData } from './http';

export async function sendHomeFeedback(rating: number, comment: string): Promise<void> {
  const res = await api.post('/api/app-feedback', {
    rating,
    comment,
    page: 'app-mobile:inicio',
  });
  await readApiData(res);
}
