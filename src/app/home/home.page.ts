import { Component, OnInit, NgZone, ChangeDetectorRef } from '@angular/core';
import { CommonModule } from '@angular/common';
import { HttpClientModule, HttpClient } from '@angular/common/http';
import { 
  IonHeader, IonToolbar, IonTitle, IonContent,
  IonButton, IonIcon, IonList, IonListHeader,
  IonLabel, IonNote, AlertController 
} from '@ionic/angular';
import { addIcons } from 'ionicons';
import {
  mic, pause, play, stop, checkmarkDone,
  createOutline, trashOutline, musicalNotes
} from 'ionicons/icons';
import { VoiceRecorder } from 'capacitor-voice-recorder';
import { Filesystem, Directory } from '@capacitor/filesystem';
import { Preferences } from '@capacitor/preferences';

@Component({
  selector: 'app-home',
  templateUrl: 'home.page.html',
  styleUrls: ['home.page.scss'],
  standalone: true,
  imports: [
    CommonModule,
    HttpClientModule,
    IonHeader, IonToolbar, IonTitle, IonContent,
    IonButton, IonIcon, IonList, IonListHeader,
    IonLabel, IonNote
  ],
})
export class HomePage implements OnInit {
  isRecording = false;
  isPaused = false;
  recordings: { id?: number; title: string; file_path: string; duration: string; audioUrl?: string }[] = [];

  private apiUrl = 'http://192.168.100.64/voice/index.php';
  private blobCache = new Map<string, string>();

  constructor(
    private http: HttpClient,
    private zone: NgZone,
    private cdr: ChangeDetectorRef, // <--- Idinagdag para sa instant UI refresh
    private alertCtrl: AlertController
  ) {
    addIcons({
      mic, pause, play, stop, checkmarkDone,
      createOutline, trashOutline, musicalNotes
    });
  }

  async ngOnInit() {
    await this.loadFromNativePreferences();
    await this.checkAndRequestPermission();
  }

  async loadFromNativePreferences() {
    try {
      const { value } = await Preferences.get({ key: 'saved_voice_recordings' });
      if (value) {
        const parsed = JSON.parse(value);
        
        for (const rec of parsed) {
          if (!this.blobCache.has(rec.file_path)) {
            try {
              const audioFile = await Filesystem.readFile({
                path: rec.file_path,
                directory: Directory.Data
              });
              const fileData = audioFile.data;
              if (typeof fileData === 'string') {
                const byteCharacters = atob(fileData);
                const byteNumbers = new Array(byteCharacters.length);
                for (let i = 0; i < byteCharacters.length; i++) {
                  byteNumbers[i] = byteCharacters.charCodeAt(i);
                }
                const byteArray = new Uint8Array(byteNumbers);
                const blob = new Blob([byteArray], { type: 'audio/aac' });
                const url = URL.createObjectURL(blob);
                this.blobCache.set(rec.file_path, url);
                rec.audioUrl = url;
              }
            } catch (err) {}
          } else {
            rec.audioUrl = this.blobCache.get(rec.file_path);
          }
        }

        this.zone.run(() => {
          this.recordings = parsed;
          this.cdr.detectChanges();
        });
      }
    } catch (e) {
      console.error('Error loading preferences:', e);
    }
  }

  private async saveToNativePreferences() {
    try {
      const cleanData = this.recordings.map(({ audioUrl, ...rest }) => rest);
      await Preferences.set({
        key: 'saved_voice_recordings',
        value: JSON.stringify(cleanData)
      });
    } catch (e) {
      console.error('Error saving preferences:', e);
    }
  }

  async checkAndRequestPermission() {
    try {
      const hasPerm = await VoiceRecorder.hasAudioRecordingPermission();
      if (!hasPerm.value) {
        await VoiceRecorder.requestAudioRecordingPermission();
      }
    } catch (e) {
      console.error('Permission error:', e);
    }
  }

  async startRecording() {
    this.zone.run(() => {
      this.isRecording = true;
      this.isPaused = false;
      this.cdr.detectChanges();
    });

    try {
      await VoiceRecorder.startRecording();
    } catch (e) {
      console.error('Start error:', e);
    }
  }

  async pauseOrResumeRecording() {
    try {
      if (!this.isPaused) {
        await VoiceRecorder.pauseRecording();
        this.zone.run(() => { 
          this.isPaused = true; 
          this.cdr.detectChanges();
        });
      } else {
        await VoiceRecorder.resumeRecording();
        this.zone.run(() => { 
          this.isPaused = false; 
          this.cdr.detectChanges();
        });
      }
    } catch (e) {
      console.error('Pause/Resume error:', e);
    }
  }

  // Naayos ang 1-click save at instant UI rendering
  async saveRecording() {
    try {
      let result: any = null;
      try {
        result = await VoiceRecorder.stopRecording();
      } catch (e) {
        try {
          await VoiceRecorder.resumeRecording();
          result = await VoiceRecorder.stopRecording();
        } catch (err2) {
          console.warn('Stop warning:', err2);
        }
      }

      if (result && result.value && result.value.recordDataBase64) {
        const recordData = result.value.recordDataBase64;
        const duration = Math.round(result.value.msDuration / 1000) + 's';
        const fileName = `recording_${new Date().getTime()}.aac`;

        await Filesystem.writeFile({
          path: fileName,
          data: recordData,
          directory: Directory.Data
        });

        const byteCharacters = atob(recordData);
        const byteNumbers = new Array(byteCharacters.length);
        for (let i = 0; i < byteCharacters.length; i++) {
          byteNumbers[i] = byteCharacters.charCodeAt(i);
        }
        const byteArray = new Uint8Array(byteNumbers);
        const blob = new Blob([byteArray], { type: 'audio/aac' });
        const url = URL.createObjectURL(blob);
        this.blobCache.set(fileName, url);

        const newRecordingItem = {
          title: `Voice Note ${this.recordings.length + 1}`,
          file_path: fileName,
          duration,
          audioUrl: url
        };

        // INSTANT NA ILALABAS SA SCREEN GAMIT ANG CDR AT ZONE
        this.zone.run(() => {
          this.recordings = [newRecordingItem, ...this.recordings];
          this.isRecording = false;
          this.isPaused = false;
          this.cdr.detectChanges(); // Pinipilit i-refresh ang UI agad-agad
        });

        await this.saveToNativePreferences();

        // Background sync sa server
        const payload = {
          title: newRecordingItem.title,
          file_name: fileName,
          duration,
          file_path: fileName
        };

        this.http.post<any>(this.apiUrl, payload).subscribe({
          next: () => {},
          error: (err) => {}
        });
      } else {
        this.zone.run(() => {
          this.isRecording = false;
          this.isPaused = false;
          this.cdr.detectChanges();
        });
      }
    } catch (e) {
      console.error('Save error:', e);
      this.zone.run(() => {
        this.isRecording = false;
        this.isPaused = false;
        this.cdr.detectChanges();
      });
    }
  }

  async editRecording(rec: any) {
    const alertBox = await this.alertCtrl.create({
      header: 'Rename Recording',
      inputs: [
        {
          name: 'title',
          type: 'text',
          value: rec.title,
          placeholder: 'Enter new recording title'
        }
      ],
      buttons: [
        { text: 'Cancel', role: 'cancel' },
        {
          text: 'Save',
          handler: async (data: any) => {
            const newTitle = data.title || (data.values && data.values.title) || '';
            if (newTitle && newTitle.trim() !== '') {
              const updatedTitle = newTitle.trim();

              this.zone.run(() => {
                rec.title = updatedTitle;
                this.recordings = this.recordings.map(item => 
                  item === rec ? { ...item, title: updatedTitle } : item
                );
                this.cdr.detectChanges();
              });

              await this.saveToNativePreferences();

              if (rec.id) {
                this.http.put<any>(this.apiUrl, { id: rec.id, title: updatedTitle }).subscribe({
                  next: () => {},
                  error: (err) => {}
                });
              }
            }
          }
        }
      ]
    });

    await alertBox.present();
  }

  async deleteRecording(rec: any) {
    this.zone.run(() => {
      this.recordings = this.recordings.filter(r => r !== rec);
      this.cdr.detectChanges();
    });

    await this.saveToNativePreferences();

    const cached = this.blobCache.get(rec.file_path);
    if (cached) {
      URL.revokeObjectURL(cached);
      this.blobCache.delete(rec.file_path);
    }

    try {
      await Filesystem.deleteFile({
        path: rec.file_path,
        directory: Directory.Data
      });
    } catch (e) {
      console.error('Error deleting local file:', e);
    }

    if (rec.id) {
      this.http.delete<any>(`${this.apiUrl}?id=${rec.id}`).subscribe({
        next: () => {},
        error: (err) => {}
      });
    }
  }
}